import { App, PluginSettingTab, Setting, Platform } from "obsidian";
import type AgentClientPlugin from "../../plugin";
import type { AgentEnvVar } from "../../plugin";
import { normalizeEnvVars } from "../../shared/settings-utils";

export class AgentClientSettingTab extends PluginSettingTab {
	plugin: AgentClientPlugin;
	private unsubscribe: (() => void) | null = null;

	constructor(app: App, plugin: AgentClientPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Cleanup previous subscription if exists
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		// Installation instructions heading
		new Setting(containerEl).setName("Installation commands").setHeading();

		// Installation details
		const installDetails = containerEl.createEl("details");
		installDetails.createEl("summary", {
			text: "Click to view installation commands",
			cls: "agent-client-install-summary",
		});

		const commandsDiv = installDetails.createDiv({
			cls: "agent-client-commands-div",
		});

		// Subscription note
		const subscriptionNote = commandsDiv.createDiv({
			cls: "agent-client-subscription-note",
		});
		subscriptionNote.createEl("strong", { text: "Note:" });
		subscriptionNote.appendText(" Claude Code requires a subscription. ");
		subscriptionNote.createEl("a", {
			text: "Download and subscribe here",
			href: "https://claude.com/product/claude-code",
			cls: "external-link",
			attr: { target: "_blank", rel: "noopener" },
		});
		subscriptionNote.appendText(".");

		// AppImage warning (Linux)
		const appImageWarning = commandsDiv.createDiv({
			cls: "agent-client-appimage-warning",
		});
		appImageWarning.createEl("strong", { text: "⚠️ Linux users:" });
		appImageWarning.appendText(" This plugin requires the ");
		appImageWarning.createEl("strong", { text: "AppImage" });
		appImageWarning.appendText(" version of Obsidian. The ");
		appImageWarning.createEl("strong", { text: "Flathub" });
		appImageWarning.appendText(
			" version will not work due to sandboxing restrictions.",
		);

		// Install command
		commandsDiv.createEl("strong", { text: "1. Install Claude Code:" });
		this.createCodeBlockWithCopy(
			commandsDiv,
			"npm install -g @zed-industries/claude-code-acp",
		);

		// Find paths
		commandsDiv.createEl("strong", { text: "2. Find installation paths:" });
		this.createCodeBlockWithCopy(
			commandsDiv,
			"which node\nwhich claude-code-acp",
		);

		new Setting(containerEl)
			.setName("Node.js path")
			.setDesc(
				'Absolute path to Node.js executable. On macOS/Linux, use "which node", and on Windows, use "where node" to find it.',
			)
			.addText((text) => {
				text.setPlaceholder("Absolute path to node")
					.setValue(this.plugin.settings.nodePath)
					.onChange(async (value) => {
						this.plugin.settings.nodePath = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Auto-allow permissions")
			.setDesc(
				"Automatically allow all permission requests from agents. ⚠️ Use with caution - this gives agents full access to your system.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoAllowPermissions)
					.onChange(async (value) => {
						this.plugin.settings.autoAllowPermissions = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-mention active note")
			.setDesc(
				"Include the current note in your messages automatically. The agent will have access to its content without typing @notename.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoMentionActiveNote)
					.onChange(async (value) => {
						this.plugin.settings.autoMentionActiveNote = value;
						await this.plugin.saveSettings();
					}),
			);

		// Windows WSL Settings (Windows only)
		if (Platform.isWin) {
			new Setting(containerEl)
				.setName("Windows Subsystem for Linux")
				.setHeading();

			new Setting(containerEl)
				.setName("Enable WSL mode")
				.setDesc(
					"Run agents inside Windows Subsystem for Linux. Recommended for agents like Codex that don't work well in native Windows environments.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.windowsWslMode)
						.onChange(async (value) => {
							this.plugin.settings.windowsWslMode = value;
							await this.plugin.saveSettings();
							this.display(); // Refresh to show/hide distribution setting
						}),
				);

			if (this.plugin.settings.windowsWslMode) {
				new Setting(containerEl)
					.setName("WSL distribution")
					.setDesc(
						"Specify WSL distribution name (leave empty for default). Example: Ubuntu, Debian",
					)
					.addText((text) =>
						text
							.setPlaceholder("Leave empty for default")
							.setValue(
								this.plugin.settings.windowsWslDistribution ||
									"",
							)
							.onChange(async (value) => {
								this.plugin.settings.windowsWslDistribution =
									value.trim() || undefined;
								await this.plugin.saveSettings();
							}),
					);
			}
		}

		new Setting(containerEl).setName("Claude Code agent").setHeading();

		this.renderClaudeSettings(containerEl);

		new Setting(containerEl).setName("Export").setHeading();

		new Setting(containerEl)
			.setName("Export folder")
			.setDesc("Folder where chat exports will be saved")
			.addText((text) =>
				text
					.setPlaceholder("Agent client")
					.setValue(this.plugin.settings.exportSettings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportSettings.defaultFolder =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Filename")
			.setDesc(
				"Template for exported filenames. Use {date} for date and {time} for time",
			)
			.addText((text) =>
				text
					.setPlaceholder("agent_client_{date}_{time}")
					.setValue(
						this.plugin.settings.exportSettings.filenameTemplate,
					)
					.onChange(async (value) => {
						this.plugin.settings.exportSettings.filenameTemplate =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-export on new chat")
			.setDesc(
				"Automatically export the current chat when starting a new chat",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.exportSettings.autoExportOnNewChat,
					)
					.onChange(async (value) => {
						this.plugin.settings.exportSettings.autoExportOnNewChat =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-export on close chat")
			.setDesc(
				"Automatically export the current chat when closing the chat view",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.exportSettings
							.autoExportOnCloseChat,
					)
					.onChange(async (value) => {
						this.plugin.settings.exportSettings.autoExportOnCloseChat =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open note after export")
			.setDesc("Automatically open the exported note after exporting")
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.exportSettings.openFileAfterExport,
					)
					.onChange(async (value) => {
						this.plugin.settings.exportSettings.openFileAfterExport =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Developer").setHeading();

		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc(
				"Enable debug logging to console. Useful for development and troubleshooting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	/**
	 * Create a code block with a copy button
	 */
	private createCodeBlockWithCopy(
		parent: HTMLElement,
		code: string,
	): HTMLElement {
		// Container for code block and button
		const container = parent.createDiv({
			cls: "agent-client-code-container",
		});

		// Code block
		const pre = container.createEl("pre", {
			cls: "agent-client-code-pre",
		});

		const codeEl = pre.createEl("code");
		codeEl.setText(code);

		// Copy button
		const copyBtn = container.createEl("button", {
			text: "Copy",
			cls: "agent-client-copy-btn",
		});

		copyBtn.addEventListener("click", () => {
			navigator.clipboard
				.writeText(code)
				.then(() => {
					const originalText = copyBtn.getText();
					copyBtn.setText("Copied!");
					copyBtn.addClass("copied");
					setTimeout(() => {
						copyBtn.setText(originalText);
						copyBtn.removeClass("copied");
					}, 2000);
				})
				.catch((err) => {
					console.error("Failed to copy:", err);
					copyBtn.setText("Failed");
					setTimeout(() => {
						copyBtn.setText("Copy");
					}, 2000);
				});
		});

		return container;
	}

	private renderClaudeSettings(sectionEl: HTMLElement) {
		const claude = this.plugin.settings.claude;

		new Setting(sectionEl)
			.setName(claude.displayName || "Claude Code (ACP)")
			.setHeading();

		new Setting(sectionEl)
			.setName("API key")
			.setDesc(
				"Anthropic API key. Required if not logging in with an Anthropic account. (Stored as plain text)",
			)
			.addText((text) => {
				text.setPlaceholder("Enter your Anthropic API key")
					.setValue(claude.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.claude.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(sectionEl)
			.setName("Path")
			.setDesc(
				'Absolute path to the claude-code-acp. On macOS/Linux, use "which claude-code-acp", and on Windows, use "where claude-code-acp" to find it.',
			)
			.addText((text) => {
				text.setPlaceholder("Absolute path to claude-code-acp")
					.setValue(claude.command)
					.onChange(async (value) => {
						this.plugin.settings.claude.command = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(sectionEl)
			.setName("Arguments")
			.setDesc(
				"Enter one argument per line. Leave empty to run without arguments.",
			)
			.addTextArea((text) => {
				text.setPlaceholder("")
					.setValue(this.formatArgs(claude.args))
					.onChange(async (value) => {
						this.plugin.settings.claude.args =
							this.parseArgs(value);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
			});

		new Setting(sectionEl)
			.setName("Environment variables")
			.setDesc(
				"Enter KEY=VALUE pairs, one per line. ANTHROPIC_API_KEY is derived from the field above.",
			)
			.addTextArea((text) => {
				text.setPlaceholder("")
					.setValue(this.formatEnv(claude.env))
					.onChange(async (value) => {
						this.plugin.settings.claude.env = this.parseEnv(value);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
			});
	}

	private formatArgs(args: string[]): string {
		return args.join("\n");
	}

	private parseArgs(value: string): string[] {
		return value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	private formatEnv(env: AgentEnvVar[]): string {
		return env
			.map((entry) => `${entry.key}=${entry.value ?? ""}`)
			.join("\n");
	}

	private parseEnv(value: string): AgentEnvVar[] {
		const envVars: AgentEnvVar[] = [];

		for (const line of value.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const delimiter = trimmed.indexOf("=");
			if (delimiter === -1) {
				continue;
			}
			const key = trimmed.slice(0, delimiter).trim();
			const envValue = trimmed.slice(delimiter + 1).trim();
			if (!key) {
				continue;
			}
			envVars.push({ key, value: envValue });
		}

		return normalizeEnvVars(envVars);
	}
}
