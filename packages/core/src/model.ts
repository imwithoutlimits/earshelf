export type SourceType = 'pdf' | 'epub' | 'md' | 'txt' | 'docx' | 'html' | 'image' | 'url' | 'paste';

export type BlockType =
  | 'heading' | 'paragraph' | 'list_item' | 'quote' | 'table'
  | 'figure' | 'caption' | 'footnote' | 'code' | 'equation';

export interface DocBlock {
  id: string;
  type: BlockType;
  text: string;
  level?: number;
  ordered?: boolean;
  page?: number;
  rows?: string[][];
}

export interface DocSection {
  id: string;
  title: string;
  level: number;
  blockIds: string[];
}

export interface CleanupReport {
  pageNumbers: number;
  repeatedHeaders: number;
  footnotes: number;
  references: number;
  citations: number;
  tables: number;
  figures: number;
  hyphenatedWords: number;
  /** Found in newer imports only, so they are optional on documents saved earlier. */
  urls?: number;
  emoji?: number;
  contents?: number;
  code?: number;
}

export interface ParsedDocument {
  title: string;
  author?: string;
  sourceType: SourceType;
  language?: string;
  blocks: DocBlock[];
  sections: DocSection[];
  wordCount: number;
  pageCount?: number;
  report?: CleanupReport;
}

export type ReadingMode = 'clean' | 'complete' | 'audiobook' | 'study' | 'accessibility';

export interface NarrationOptions {
  tables: 'skip' | 'announce' | 'read';
  readCaptions: boolean;
  readFootnotes: 'never' | 'inline';
  citations: 'skip' | 'author-year' | 'full';
  equations: 'off' | 'symbols';
  /** Split quoted speech into its own utterances so it can be read in a second voice. */
  splitDialogue: boolean;
  headingPauseMs: number;
  sectionPauseMs: number;
  paragraphPauseMs: number;
  sentencePauseMs: number;
}

export interface Utterance {
  id: string;
  blockId: string;
  sectionId: string;
  kind: BlockType | 'announce';
  /** Text shown and highlighted in the reader. */
  text: string;
  /** Text sent to the voice (pronunciations and citation handling applied). */
  spoken: string;
  pauseAfterMs: number;
  /** Set for quoted speech when dialogue splitting is on. */
  role?: 'dialogue';
}

export interface PronunciationEntry {
  term: string;
  say: string;
}

/** Person-level choices that sit on top of a reading mode. Anything left out follows the mode. */
export interface NarrationOverrides {
  citations?: NarrationOptions['citations'];
  equations?: NarrationOptions['equations'];
  tables?: NarrationOptions['tables'];
  dialogue?: boolean;
}
