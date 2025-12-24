/**
 * Port for accessing Obsidian vault
 *
 * This interface abstracts vault operations (reading notes, searching, etc.),
 * allowing the domain layer to work with notes without depending on
 * Obsidian's specific APIs (TFile, Vault, MetadataCache, etc.).
 */

/**
 * Position in the editor (line and character).
 * Line numbers are 0-indexed.
 */
export interface EditorPosition {
	/** Line number (0-indexed) */
	line: number;
	/** Character position within the line */
	ch: number;
}

/**
 * Metadata for a note in the vault.
 *
 * Contains essential information about a note file without
 * exposing Obsidian's internal TFile structure.
 */
export interface NoteMetadata {
	/** Full path to the note within the vault (e.g., "folder/note.md") */
	path: string;

	/** Filename without extension (e.g., "note") */
	name: string;

	/** File extension (usually "md") */
	extension: string;

	/** Creation timestamp (milliseconds since epoch) */
	created: number;

	/** Last modified timestamp (milliseconds since epoch) */
	modified: number;

	/** Optional aliases from frontmatter */
	aliases?: string[];

	/** Optional text selection range in the editor */
	selection?: {
		from: EditorPosition;
		to: EditorPosition;
	};
}

/**
 * Metadata for a Claude Code sub-agent.
 *
 * Sub-agents are defined in ~/.claude/agents/ directory
 * as markdown files with YAML frontmatter.
 */
export interface SubAgentMetadata {
	/** Agent name from frontmatter (e.g., "terraform-scaffolder") */
	name: string;

	/** Agent description from frontmatter */
	description: string;

	/** Model preference from frontmatter (e.g., "sonnet") */
	model?: string;

	/** Color identifier from frontmatter (e.g., "blue") */
	color?: string;

	/** Emoji to display in UI (always "🤖" for sub-agents) */
	emoji: string;

	/** Full path to the agent's markdown file */
	filePath: string;
}

/**
 * Interface for accessing vault notes and files.
 *
 * Provides methods for searching, reading, and listing notes
 * in the Obsidian vault. This port will be implemented by adapters
 * that use Obsidian's Vault API, NoteMentionService, etc.
 */
export interface IVaultAccess {
	/**
	 * Read the content of a note.
	 *
	 * @param path - Path to the note within the vault
	 * @returns Promise resolving to note content as plain text
	 * @throws Error if note doesn't exist or cannot be read
	 */
	readNote(path: string): Promise<string>;

	/**
	 * Search for notes matching a query.
	 *
	 * Uses fuzzy search against note names, paths, and aliases.
	 * Returns up to 5 best matches sorted by relevance.
	 * If query is empty, returns recently modified files.
	 *
	 * @param query - Search query string (can be empty for recent files)
	 * @returns Promise resolving to array of matching note metadata
	 */
	searchNotes(query: string): Promise<NoteMetadata[]>;

	/**
	 * Get the currently active note in the editor.
	 *
	 * @returns Promise resolving to active note metadata, or null if no note is active
	 */
	getActiveNote(): Promise<NoteMetadata | null>;

	/**
	 * List all markdown notes in the vault.
	 *
	 * @returns Promise resolving to array of all note metadata
	 */
	listNotes(): Promise<NoteMetadata[]>;

	/**
	 * Get available Claude Code sub-agents from ~/.claude/agents/
	 *
	 * Sub-agents are specialized agents defined as markdown files
	 * with YAML frontmatter in the user's Claude configuration directory.
	 *
	 * @returns Promise resolving to array of sub-agent metadata
	 */
	getAvailableSubAgents(): Promise<SubAgentMetadata[]>;
}
