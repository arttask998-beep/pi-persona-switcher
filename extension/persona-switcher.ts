/**
 * Persona Switcher Extension
 *
 * Reads ~/.pi/agent/personas/active.json before every run and appends the
 * selected persona file to the system prompt. Switching the state file takes
 * effect on the next message; no /reload or restart is required.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR
	? path.resolve(process.env.PI_CODING_AGENT_DIR)
	: path.join(os.homedir(), ".pi", "agent");
const PERSONA_DIR = path.join(AGENT_DIR, "personas");
const STATE_FILE = path.join(PERSONA_DIR, "active.json");
const MAX_PERSONA_BYTES = 64 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const PANEL_URL = "http://127.0.0.1:30142";

type PersonaState = { id: string; enabled: boolean; updatedAt?: string };

function readState(): PersonaState {
	try {
		const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Partial<PersonaState>;
		return {
			id: typeof raw.id === "string" ? raw.id : "default",
			enabled: raw.enabled === true,
			updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
		};
	} catch {
		return { id: "default", enabled: false };
	}
}

function writeState(state: PersonaState): void {
	fs.mkdirSync(PERSONA_DIR, { recursive: true });
	const tmp = `${STATE_FILE}.${process.pid}.tmp`;
	fs.writeFileSync(
		tmp,
		JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
		"utf8",
	);
	fs.renameSync(tmp, STATE_FILE);
}

function personaPath(id: string): string | null {
	if (!ID_RE.test(id)) return null;
	const file = path.resolve(PERSONA_DIR, `${id}.md`);
	if (!file.startsWith(path.resolve(PERSONA_DIR) + path.sep)) return null;
	return file;
}

function loadActivePersona(): { id: string; text: string } | null {
	const state = readState();
	if (!state.enabled) return null;
	const file = personaPath(state.id);
	if (!file || !fs.existsSync(file)) return null;
	const stat = fs.statSync(file);
	if (stat.size > MAX_PERSONA_BYTES) return null;
	const text = fs.readFileSync(file, "utf8").trim();
	return text ? { id: state.id, text } : null;
}

function listPersonas(): string[] {
	try {
		return fs
			.readdirSync(PERSONA_DIR)
			.filter((name) => name.endsWith(".md") && !name.startsWith("README"))
			.map((name) => name.slice(0, -3))
			.filter((id) => ID_RE.test(id))
			.sort();
	} catch {
		return [];
	}
}

export default function personaSwitcher(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		// pi-web builds its request from systemPromptOptions, so inject through
		// sections rather than returning a replaced systemPrompt.
		const options = event.systemPromptOptions as any;
		if (!options.sections) options.sections = {};
		const active = loadActivePersona();
		if (!active) {
			delete options.sections.persona;
			return;
		}
		options.sections.persona = `<persona id="${active.id}">\n${active.text}\n</persona>`;
	});

	pi.registerCommand("persona", {
		description: "Switch the active persona: /persona list | /persona use <id> | /persona off",
		handler: async (args: string, ctx: any) => {
			const notify = (message: string) => {
				try {
					ctx?.ui?.notify?.(message, "info");
				} catch {}
			};
			const parts = (args || "").trim().split(/\s+/).filter(Boolean);
			const cmd = parts[0] ?? "list";

			if (cmd === "off" || cmd === "disable") {
				const state = readState();
				writeState({ ...state, enabled: false });
				notify("Persona disabled");
				return;
			}

			if (cmd === "use" && parts[1]) {
				const id = parts[1];
				if (!personaPath(id) || !fs.existsSync(personaPath(id)!)) {
					notify(`Unknown persona: ${id}`);
					return;
				}
				writeState({ id, enabled: true });
				notify(`Persona enabled: ${id}`);
				return;
			}

			const state = readState();
			const list = listPersonas();
			notify(
				`Personas: ${list.join(", ") || "(none)"} | active: ${
					state.enabled ? state.id : "off"
				}`,
			);
		},
	});

	pi.registerCommand("panel", {
		description: "Open the Pi persona panel in your browser",
		handler: async (_args: string, ctx: any) => {
			const notify = (message: string, type: "info" | "warning" = "info") => {
				try {
					ctx?.ui?.notify?.(message, type);
				} catch {}
			};
			try {
				const res = await (globalThis as any).fetch(`${PANEL_URL}/api/health`, {
					signal: AbortSignal.timeout(1500),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
			} catch {
				notify(`面板未运行：${PANEL_URL}，先运行 start-persona-panel.cmd`, "warning");
				return;
			}
			try {
				pi.sendMessage(
					{
						customType: "persona-panel",
						content: `[打开人格面板](${PANEL_URL})\n\n${PANEL_URL}`,
						display: true,
					},
					{ triggerTurn: false },
				);
				notify("已发送人格面板链接", "info");
			} catch {
				notify(`发送失败，请手动访问 ${PANEL_URL}`, "warning");
			}
		},
	});
}
