import { Plugin, WorkspaceLeaf, Notice, requestUrl } from "obsidian";
import * as semver from "semver";
import { ChatView, VIEW_TYPE_CHAT } from "./components/chat/ChatView";
import {
	createSettingsStore,
	type SettingsStore,
} from "./adapters/obsidian/settings-store.adapter";
import { AgentClientSettingTab } from "./components/settings/AgentClientSettingTab";
import {
	sanitizeArgs,
	normalizeEnvVars,
} from "./shared/settings-utils";
import {
	AgentEnvVar,
	ClaudeAgentSettings,
} from "./domain/models/agent-config";

// Re-export for backward compatibility
export type { AgentEnvVar };

export interface AgentClientPluginSettings {
	claude: ClaudeAgentSettings;
	autoAllowPermissions: boolean;
	autoMentionActiveNote: boolean;
	debugMode: boolean;
	nodePath: string;
	exportSettings: {
		defaultFolder: string;
		filenameTemplate: string;
		autoExportOnNewChat: boolean;
		autoExportOnCloseChat: boolean;
		openFileAfterExport: boolean;
	};
	// WSL settings (Windows only)
	windowsWslMode: boolean;
	windowsWslDistribution?: string;
}

const DEFAULT_SETTINGS: AgentClientPluginSettings = {
	claude: {
		id: "claude-code-acp",
		displayName: "Claude Code",
		apiKey: "",
		command: "",
		args: [],
		env: [],
	},
	autoAllowPermissions: false,
	autoMentionActiveNote: true,
	debugMode: false,
	nodePath: "",
	exportSettings: {
		defaultFolder: "Agent Client",
		filenameTemplate: "agent_client_{date}_{time}",
		autoExportOnNewChat: false,
		autoExportOnCloseChat: false,
		openFileAfterExport: true,
	},
	windowsWslMode: false,
	windowsWslDistribution: undefined,
};

export default class AgentClientPlugin extends Plugin {
	settings: AgentClientPluginSettings;
	settingsStore!: SettingsStore;

	// Active ACP adapter instance (shared across use cases)
	acpAdapter: import("./adapters/acp/acp.adapter").AcpAdapter | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize settings store
		this.settingsStore = createSettingsStore(this.settings, this);

		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		const ribbonIconEl = this.addRibbonIcon(
			"bot-message-square",
			"Open agent client",
			(_evt: MouseEvent) => {
				void this.activateView();
			},
		);
		ribbonIconEl.addClass("agent-client-ribbon-icon");

		this.addCommand({
			id: "open-chat-view",
			name: "Open agent chat",
			callback: () => {
				void this.activateView();
			},
		});

		// Register agent-specific commands
		this.registerAgentCommands();
		this.registerPermissionCommands();

		this.addSettingTab(new AgentClientSettingTab(this.app, this));
	}

	onunload() {}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_CHAT,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
			// Focus textarea after revealing the leaf
			const viewContainerEl = leaf.view?.containerEl;
			if (viewContainerEl) {
				window.setTimeout(() => {
					const textarea = viewContainerEl.querySelector(
						"textarea.chat-input-textarea",
					);
					if (textarea instanceof HTMLTextAreaElement) {
						textarea.focus();
					}
				}, 0);
			}
		}
	}

	/**
	 * Open chat view and start a new chat
	 */
	private async openChatWithNewSession(): Promise<void> {
		// Activate view (create new or focus existing)
		await this.activateView();

		// Trigger new chat
		this.app.workspace.trigger(
			"agent-client:new-chat-requested" as "quit",
		);
	}

	/**
	 * Register command for creating a new chat
	 */
	private registerAgentCommands(): void {
		this.addCommand({
			id: "open-chat-with-claude-code-acp",
			name: `New chat with ${this.settings.claude.displayName || "Claude Code"}`,
			callback: async () => {
				await this.openChatWithNewSession();
			},
		});
	}

	private registerPermissionCommands(): void {
		this.addCommand({
			id: "approve-active-permission",
			name: "Approve active permission",
			callback: async () => {
				await this.activateView();
				this.app.workspace.trigger(
					"agent-client:approve-active-permission",
				);
			},
		});

		this.addCommand({
			id: "reject-active-permission",
			name: "Reject active permission",
			callback: async () => {
				await this.activateView();
				this.app.workspace.trigger(
					"agent-client:reject-active-permission",
				);
			},
		});

		this.addCommand({
			id: "toggle-auto-mention",
			name: "Toggle auto-mention",
			callback: async () => {
				await this.activateView();
				this.app.workspace.trigger("agent-client:toggle-auto-mention");
			},
		});

		this.addCommand({
			id: "cancel-current-message",
			name: "Cancel current message",
			callback: () => {
				this.app.workspace.trigger("agent-client:cancel-message");
			},
		});
	}

	async loadSettings() {
		const rawSettings = ((await this.loadData()) ?? {}) as Record<
			string,
			unknown
		>;

		const claudeFromRaw =
			typeof rawSettings.claude === "object" &&
			rawSettings.claude !== null
				? (rawSettings.claude as Record<string, unknown>)
				: {};

		const resolvedClaudeArgs = sanitizeArgs(claudeFromRaw.args);
		const resolvedClaudeEnv = normalizeEnvVars(claudeFromRaw.env);

		this.settings = {
			claude: {
				id: DEFAULT_SETTINGS.claude.id,
				displayName:
					typeof claudeFromRaw.displayName === "string" &&
					claudeFromRaw.displayName.trim().length > 0
						? claudeFromRaw.displayName.trim()
						: DEFAULT_SETTINGS.claude.displayName,
				apiKey:
					typeof claudeFromRaw.apiKey === "string"
						? claudeFromRaw.apiKey
						: DEFAULT_SETTINGS.claude.apiKey,
				command:
					typeof claudeFromRaw.command === "string" &&
					claudeFromRaw.command.trim().length > 0
						? claudeFromRaw.command.trim()
						: typeof rawSettings.claudeCodeAcpCommandPath ===
									"string" &&
							  rawSettings.claudeCodeAcpCommandPath.trim()
									.length > 0
							? rawSettings.claudeCodeAcpCommandPath.trim()
							: DEFAULT_SETTINGS.claude.command,
				args: resolvedClaudeArgs.length > 0 ? resolvedClaudeArgs : [],
				env: resolvedClaudeEnv.length > 0 ? resolvedClaudeEnv : [],
			},
			autoAllowPermissions:
				typeof rawSettings.autoAllowPermissions === "boolean"
					? rawSettings.autoAllowPermissions
					: DEFAULT_SETTINGS.autoAllowPermissions,
			autoMentionActiveNote:
				typeof rawSettings.autoMentionActiveNote === "boolean"
					? rawSettings.autoMentionActiveNote
					: DEFAULT_SETTINGS.autoMentionActiveNote,
			debugMode:
				typeof rawSettings.debugMode === "boolean"
					? rawSettings.debugMode
					: DEFAULT_SETTINGS.debugMode,
			nodePath:
				typeof rawSettings.nodePath === "string"
					? rawSettings.nodePath.trim()
					: DEFAULT_SETTINGS.nodePath,
			exportSettings: (() => {
				const rawExport = rawSettings.exportSettings as
					| Record<string, unknown>
					| null
					| undefined;
				if (rawExport && typeof rawExport === "object") {
					return {
						defaultFolder:
							typeof rawExport.defaultFolder === "string"
								? rawExport.defaultFolder
								: DEFAULT_SETTINGS.exportSettings.defaultFolder,
						filenameTemplate:
							typeof rawExport.filenameTemplate === "string"
								? rawExport.filenameTemplate
								: DEFAULT_SETTINGS.exportSettings
										.filenameTemplate,
						autoExportOnNewChat:
							typeof rawExport.autoExportOnNewChat === "boolean"
								? rawExport.autoExportOnNewChat
								: DEFAULT_SETTINGS.exportSettings
										.autoExportOnNewChat,
						autoExportOnCloseChat:
							typeof rawExport.autoExportOnCloseChat === "boolean"
								? rawExport.autoExportOnCloseChat
								: DEFAULT_SETTINGS.exportSettings
										.autoExportOnCloseChat,
						openFileAfterExport:
							typeof rawExport.openFileAfterExport === "boolean"
								? rawExport.openFileAfterExport
								: DEFAULT_SETTINGS.exportSettings
										.openFileAfterExport,
					};
				}
				return DEFAULT_SETTINGS.exportSettings;
			})(),
			windowsWslMode:
				typeof rawSettings.windowsWslMode === "boolean"
					? rawSettings.windowsWslMode
					: DEFAULT_SETTINGS.windowsWslMode,
			windowsWslDistribution:
				typeof rawSettings.windowsWslDistribution === "string"
					? rawSettings.windowsWslDistribution
					: DEFAULT_SETTINGS.windowsWslDistribution,
		};

	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async saveSettingsAndNotify(nextSettings: AgentClientPluginSettings) {
		this.settings = nextSettings;
		await this.saveData(this.settings);
		this.settingsStore.set(this.settings);
	}

	/**
	 * Fetch the latest stable release version from GitHub.
	 */
	private async fetchLatestStable(): Promise<string | null> {
		const response = await requestUrl({
			url: "https://api.github.com/repos/RAIT-09/obsidian-agent-client/releases/latest",
		});
		const data = response.json as { tag_name?: string };
		return data.tag_name ? semver.clean(data.tag_name) : null;
	}

	/**
	 * Fetch the latest prerelease version from GitHub.
	 */
	private async fetchLatestPrerelease(): Promise<string | null> {
		const response = await requestUrl({
			url: "https://api.github.com/repos/RAIT-09/obsidian-agent-client/releases",
		});
		const releases = response.json as Array<{
			tag_name: string;
			prerelease: boolean;
		}>;

		// Find the first prerelease (releases are sorted by date descending)
		const latestPrerelease = releases.find((r) => r.prerelease);
		return latestPrerelease
			? semver.clean(latestPrerelease.tag_name)
			: null;
	}

	/**
	 * Check for plugin updates.
	 * - Stable version users: compare with latest stable release
	 * - Prerelease users: compare with both latest stable and latest prerelease
	 */
	async checkForUpdates(): Promise<boolean> {
		const currentVersion =
			semver.clean(this.manifest.version) || this.manifest.version;
		const isCurrentPrerelease = semver.prerelease(currentVersion) !== null;

		if (isCurrentPrerelease) {
			// Prerelease user: check both stable and prerelease
			const [latestStable, latestPrerelease] = await Promise.all([
				this.fetchLatestStable(),
				this.fetchLatestPrerelease(),
			]);

			const hasNewerStable =
				latestStable && semver.gt(latestStable, currentVersion);
			const hasNewerPrerelease =
				latestPrerelease && semver.gt(latestPrerelease, currentVersion);

			if (hasNewerStable || hasNewerPrerelease) {
				// Prefer stable version notification if available
				const newestVersion = hasNewerStable
					? latestStable
					: latestPrerelease;
				new Notice(
					`[Agent Client] Update available: v${newestVersion}`,
				);
				return true;
			}
		} else {
			// Stable version user: check stable only
			const latestStable = await this.fetchLatestStable();
			if (latestStable && semver.gt(latestStable, currentVersion)) {
				new Notice(`[Agent Client] Update available: v${latestStable}`);
				return true;
			}
		}

		return false;
	}

}
