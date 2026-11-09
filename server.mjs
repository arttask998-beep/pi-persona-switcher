import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number(process.env.PERSONA_PANEL_PORT || 30142);
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR
	? path.resolve(process.env.PI_CODING_AGENT_DIR)
	: path.join(os.homedir(), ".pi", "agent");
const PERSONA_DIR = path.join(AGENT_DIR, "personas");
const STATE_FILE = path.join(PERSONA_DIR, "active.json");
const SETTINGS_FILE = path.join(AGENT_DIR, "settings.json");
const MODELS_FILE = path.join(AGENT_DIR, "models.json");
const COMPACTION_DEFAULTS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 };
const INDEX_FILE = path.join(__dirname, "public", "index.html");
const MAX_PERSONA_BYTES = 64 * 1024;
const MAX_BODY_BYTES = 256 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const VERSION = "1.2.2";

fs.mkdirSync(PERSONA_DIR, { recursive: true });

function atomicWrite(file, text) {
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, text, "utf8");
	fs.renameSync(tmp, file);
}

function readState() {
	try {
		const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
		return {
			id: typeof raw.id === "string" ? raw.id : "default",
			enabled: raw.enabled === true,
			updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
		};
	} catch {
		return { id: "default", enabled: false, updatedAt: null };
	}
}

function writeState(state) {
	atomicWrite(
		STATE_FILE,
		JSON.stringify(
			{ id: state.id, enabled: state.enabled === true, updatedAt: new Date().toISOString() },
			null,
			2,
		),
	);
}

function readSettings() {
	if (!fs.existsSync(SETTINGS_FILE)) return {};
	return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

function readCompaction() {
	const settings = readSettings();
	const compaction = settings.compaction ?? {};
	return {
		enabled: compaction.enabled !== false,
		reserveTokens: Number.isFinite(compaction.reserveTokens)
			? compaction.reserveTokens
			: COMPACTION_DEFAULTS.reserveTokens,
		keepRecentTokens: Number.isFinite(compaction.keepRecentTokens)
			? compaction.keepRecentTokens
			: COMPACTION_DEFAULTS.keepRecentTokens,
	};
}

function writeCompaction(next) {
	const settings = readSettings();
	settings.compaction = { ...(settings.compaction ?? {}), ...next };
	if (fs.existsSync(SETTINGS_FILE)) {
		fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.bak`);
	}
	atomicWrite(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
}

function readModels() {
	if (!fs.existsSync(MODELS_FILE)) return [];
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8"));
	} catch {
		return [];
	}
	const models = [];
	for (const [providerId, provider] of Object.entries(parsed.providers ?? {})) {
		for (const model of provider?.models ?? []) {
			if (!model?.id || !Number.isFinite(model.contextWindow)) continue;
			models.push({
				key: `${providerId}/${model.id}`,
				provider: providerId,
				id: model.id,
				name: model.name || model.id,
				contextWindow: model.contextWindow,
			});
		}
	}
	return models;
}

function readDefaultModelKey() {
	try {
		const settings = readSettings();
		return typeof settings.defaultModel === "string" ? settings.defaultModel : "";
	} catch {
		return "";
	}
}

function readContextInfo() {
	const models = readModels();
	const defaultModel = readDefaultModelKey();
	const selected = models.find((m) => m.key === defaultModel) ?? models[0] ?? null;
	return {
		model: selected?.key ?? defaultModel ?? null,
		contextWindow: selected?.contextWindow ?? 32768,
		models,
		defaultModel: defaultModel || null,
		source: selected && selected.key === defaultModel ? "default" : "fallback",
	};
}

function personaFile(id) {
	if (!ID_RE.test(id)) return null;
	const file = path.resolve(PERSONA_DIR, `${id}.md`);
	if (!file.startsWith(path.resolve(PERSONA_DIR) + path.sep)) return null;
	return file;
}

function personaName(id, content) {
	const first = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
	return first.startsWith("# ") ? first.slice(2).trim() || id : id;
}

function listPersonas() {
	const state = readState();
	const ids = fs
		.readdirSync(PERSONA_DIR)
		.filter((name) => name.endsWith(".md") && !name.startsWith("README"))
		.map((name) => name.slice(0, -3))
		.filter((id) => ID_RE.test(id))
		.sort();
	return ids.map((id) => {
		const file = path.join(PERSONA_DIR, `${id}.md`);
		let content = "";
		try {
			content = fs.readFileSync(file, "utf8");
		} catch {}
		const chars = [...content].length;
		return {
			id,
			name: personaName(id, content),
			chars,
			tokens: Math.ceil(chars / 2),
			active: state.enabled && state.id === id,
		};
	});
}

function sendJson(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(body);
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

function statePayload() {
	return {
		active: readState(),
		personas: listPersonas(),
		dir: PERSONA_DIR,
		version: VERSION,
	};
}

async function handle(req, res) {
	const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
	const route = url.pathname;

	try {
		if (req.method === "GET" && (route === "/" || route === "/index.html")) {
			const html = fs.readFileSync(INDEX_FILE, "utf8");
			res.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			});
			res.end(html);
			return;
		}

		if (req.method === "GET" && route === "/api/health") {
			sendJson(res, 200, { ok: true, version: VERSION, dir: PERSONA_DIR });
			return;
		}

		if (req.method === "GET" && route === "/api/state") {
			sendJson(res, 200, statePayload());
			return;
		}

		if (req.method === "GET" && route === "/api/settings") {
			sendJson(res, 200, {
				compaction: readCompaction(),
				context: readContextInfo(),
				defaults: COMPACTION_DEFAULTS,
				path: SETTINGS_FILE,
			});
			return;
		}

		if (req.method === "POST" && route === "/api/settings") {
			const body = await readBody(req);
			const reserveTokens = Number(body.reserveTokens);
			const keepRecentTokens = Number(body.keepRecentTokens);
			const valid = (n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000;
			if (!valid(reserveTokens) || !valid(keepRecentTokens)) {
				sendJson(res, 400, { error: "reserveTokens 和 keepRecentTokens 必须是 0–1,000,000 的整数" });
				return;
			}
			writeCompaction({
				enabled: body.enabled !== false,
				reserveTokens,
				keepRecentTokens,
			});
			sendJson(res, 200, {
				compaction: readCompaction(),
				context: readContextInfo(),
				path: SETTINGS_FILE,
				requiresRestart: true,
			});
			return;
		}

		if (req.method === "GET" && route === "/api/persona") {
			const id = url.searchParams.get("id") ?? "";
			const file = personaFile(id);
			if (!file || !fs.existsSync(file)) {
				sendJson(res, 404, { error: "人格不存在" });
				return;
			}
			sendJson(res, 200, { id, content: fs.readFileSync(file, "utf8") });
			return;
		}

		if (req.method === "POST" && route === "/api/persona") {
			const body = await readBody(req);
			const id = String(body.id ?? "");
			const content = String(body.content ?? "");
			const file = personaFile(id);
			if (!file) {
				sendJson(res, 400, { error: "人格 ID 不合法" });
				return;
			}
			if (Buffer.byteLength(content, "utf8") > MAX_PERSONA_BYTES) {
				sendJson(res, 413, { error: "人格文件超过 64KB" });
				return;
			}
			atomicWrite(file, content.endsWith("\n") ? content : `${content}\n`);
			sendJson(res, 200, statePayload());
			return;
		}

		if (req.method === "POST" && route === "/api/active") {
			const body = await readBody(req);
			const id = String(body.id ?? "");
			const enabled = body.enabled === true;
			const file = personaFile(id);
			if (!file || !fs.existsSync(file)) {
				sendJson(res, 404, { error: "人格不存在" });
				return;
			}
			writeState({ id, enabled });
			sendJson(res, 200, statePayload());
			return;
		}

		if (req.method === "POST" && route === "/api/create") {
			const body = await readBody(req);
			const id = String(body.id ?? "").trim();
			const name = String(body.name ?? "").trim() || id;
			const file = personaFile(id);
			if (!file) {
				sendJson(res, 400, { error: "ID 只能包含字母、数字、_、-，且不超过 32 位" });
				return;
			}
			if (fs.existsSync(file)) {
				sendJson(res, 409, { error: "同名人格已存在" });
				return;
			}
			atomicWrite(file, `# ${name}\n\n`);
			sendJson(res, 200, statePayload());
			return;
		}

		if (req.method === "POST" && route === "/api/delete") {
			const body = await readBody(req);
			const id = String(body.id ?? "");
			const file = personaFile(id);
			if (!file || !fs.existsSync(file)) {
				sendJson(res, 404, { error: "人格不存在" });
				return;
			}
			const state = readState();
			if (state.enabled && state.id === id) {
				sendJson(res, 400, { error: "请先停用该人格再删除" });
				return;
			}
			fs.unlinkSync(file);
			sendJson(res, 200, statePayload());
			return;
		}

		sendJson(res, 404, { error: "Not found" });
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
	}
}

const server = http.createServer((req, res) => {
	handle(req, res).catch((error) => {
		try {
			sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
		} catch {}
	});
});

server.listen(PORT, HOST, () => {
	console.log(`Pi Persona Panel v${VERSION}`);
	console.log(`URL:      http://${HOST}:${PORT}`);
	console.log(`Personas: ${PERSONA_DIR}`);
	console.log("Press Ctrl+C to stop.");
});
