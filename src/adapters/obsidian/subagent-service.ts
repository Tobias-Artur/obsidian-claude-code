import * as fs from "fs";
import * as path from "path";
import type { SubAgentMetadata } from "../../domain/ports/vault-access.port";

/**
 * Service for reading and parsing Claude Code sub-agents.
 *
 * Sub-agents are specialized agents defined in ~/.claude/agents/
 * as markdown files with YAML frontmatter.
 */
export class SubAgentService {
	private agentsDir: string;

	constructor() {
		// Use home directory: ~/.claude/agents
		const homeDir = process.env.HOME || process.env.USERPROFILE || "";
		this.agentsDir = path.join(homeDir, ".claude", "agents");
	}

	/**
	 * Read all sub-agents from ~/.claude/agents/
	 *
	 * @returns Promise resolving to array of sub-agent metadata
	 */
	async getSubAgents(): Promise<SubAgentMetadata[]> {
		try {
			// Check if directory exists
			if (!fs.existsSync(this.agentsDir)) {
				console.warn(
					`Sub-agents directory not found: ${this.agentsDir}`,
				);
				return [];
			}

			// Read all .md files (ignore .png, .jpg, etc.)
			const files = fs
				.readdirSync(this.agentsDir)
				.filter((f) => f.endsWith(".md"));

			const subAgents: SubAgentMetadata[] = [];

			for (const file of files) {
				const filePath = path.join(this.agentsDir, file);
				const content = fs.readFileSync(filePath, "utf-8");

				// Parse frontmatter
				const frontmatter = this.parseFrontmatter(content);
				if (frontmatter && frontmatter.name && frontmatter.description) {
					subAgents.push({
						name: frontmatter.name,
						description: frontmatter.description,
						model: frontmatter.model,
						color: frontmatter.color,
						emoji: "🤖",
						filePath,
					});
				}
			}

			return subAgents;
		} catch (error) {
			console.error("Failed to read sub-agents:", error);
			return [];
		}
	}

	/**
	 * Parse YAML frontmatter from markdown content.
	 *
	 * Simple parser that handles key: value pairs.
	 * Does not support complex YAML features (arrays, objects, etc.)
	 *
	 * @param content - Markdown file content
	 * @returns Parsed frontmatter object or null if no frontmatter found
	 */
	private parseFrontmatter(content: string): any {
		// Match frontmatter block: ---\n...\n---
		const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
		if (!match) return null;

		const yaml = match[1];
		const frontmatter: any = {};

		// Parse simple key: value pairs
		const lines = yaml.split("\n");
		for (const line of lines) {
			const colonIndex = line.indexOf(":");
			if (colonIndex > 0) {
				const key = line.slice(0, colonIndex).trim();
				const value = line.slice(colonIndex + 1).trim();
				frontmatter[key] = value;
			}
		}

		return frontmatter;
	}
}
