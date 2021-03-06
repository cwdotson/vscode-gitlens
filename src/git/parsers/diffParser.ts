'use strict';
import { Iterables, Strings } from '../../system';
import { GitDiff, GitDiffChunk, GitDiffChunkLine, GitDiffLine, GitDiffShortStat, GitStatusFile, GitStatusParser } from './../git';

const nameStatusDiffRegex = /^(.*?)\t(.*?)(?:\t(.*?))?$/gm;
const shortStatDiffRegex = /^\s*(\d+)\sfiles? changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/;
const unifiedDiffRegex = /^@@ -([\d]+),([\d]+) [+]([\d]+),([\d]+) @@([\s\S]*?)(?=^@@)/gm;

export class GitDiffParser {

    static parse(data: string, debug: boolean = false): GitDiff | undefined {
        if (!data) return undefined;

        const chunks: GitDiffChunk[] = [];

        let match: RegExpExecArray | null = null;

        let chunk: string;
        let currentStart: number;
        let previousStart: number;

        do {
            match = unifiedDiffRegex.exec(`${data}\n@@`);
            if (match == null) break;

            // Stops excessive memory usage
            // https://bugs.chromium.org/p/v8/issues/detail?id=2869
            chunk = (' ' + match[5]).substr(1);
            currentStart = parseInt(match[3], 10);
            previousStart = parseInt(match[1], 10);

            chunks.push(new GitDiffChunk(chunk, { start: currentStart, end: currentStart + parseInt(match[4], 10) }, { start: previousStart, end: previousStart + parseInt(match[2], 10) }));
        } while (match != null);

        if (!chunks.length) return undefined;

        const diff = {
            diff: debug ? data : undefined,
            chunks: chunks
        } as GitDiff;
        return diff;
    }

    static parseChunk(chunk: string): GitDiffChunkLine[] {
        const lines = Iterables.skip(Strings.lines(chunk), 1);

        const currentLines: (GitDiffLine | undefined)[] = [];
        const previousLines: (GitDiffLine | undefined)[] = [];

        let removed = 0;
        for (const l of lines) {
            switch (l[0]) {
                case '+':
                    currentLines.push({
                        line: ` ${l.substring(1)}`,
                        state: 'added'
                    });

                    if (removed > 0) {
                        removed--;
                    }
                    else {
                        previousLines.push(undefined);
                    }

                    break;

                case '-':
                    removed++;

                    previousLines.push({
                        line: ` ${l.substring(1)}`,
                        state: 'removed'
                    });

                    break;

                default:
                    while (removed > 0) {
                        removed--;
                        currentLines.push(undefined);
                    }

                    currentLines.push({ line: l, state: 'unchanged' });
                    previousLines.push({ line: l, state: 'unchanged' });

                    break;
            }
        }

        const chunkLines: GitDiffChunkLine[] = [];

        let chunkLine: GitDiffChunkLine | undefined = undefined;
        let current: GitDiffLine | undefined = undefined;

        for (let i = 0; i < currentLines.length; i++) {
            current = currentLines[i];
            if (current === undefined) {
                // Don't think we need to worry about this case because the diff will always have "padding" (i.e. unchanged lines) around each chunk
                if (chunkLine === undefined) continue;

                if (chunkLine.previous === undefined) {
                    chunkLine.previous = [previousLines[i]];
                    continue;
                }

                chunkLine.previous.push(previousLines[i]);
                continue;
            }

            chunkLine = {
                line: current.line,
                state: current.state,
                previous: [previousLines[i]]
            };
            chunkLines.push(chunkLine);
        }

        return chunkLines;
    }

    static parseNameStatus(data: string, repoPath: string): GitStatusFile[] | undefined {
        if (!data) return undefined;

        const statuses: GitStatusFile[] = [];

        let match: RegExpExecArray | null = null;
        do {
            match = nameStatusDiffRegex.exec(data);
            if (match == null) break;

            statuses.push(GitStatusParser.parseStatusFile(repoPath, match[1], match[2], match[3]));
        } while (match != null);

        if (!statuses.length) return undefined;

        return statuses;
    }

    static parseShortStat(data: string): GitDiffShortStat | undefined {
        if (!data) return undefined;

        const match = shortStatDiffRegex.exec(data);
        if (match == null) return undefined;

        const files = match[1];
        const insertions = match[2];
        const deletions = match[3];
        return {
            files: files == null ? 0 : parseInt(files, 10),
            insertions: insertions == null ? 0 : parseInt(insertions, 10),
            deletions: deletions == null ? 0 : parseInt(deletions, 10)
        } as GitDiffShortStat;
    }
}