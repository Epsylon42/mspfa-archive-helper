import * as parenTreeParser from 'paren-tree-parser';
import { TokenizerChain  } from 'paren-tree-parser';
import { Token as PTreeToken, TreeToken as PTreeTreeToken, Span } from 'paren-tree-parser/build/types.mjs';

export interface BBToken {
    name: string;
    arg?: string;
    properties: Record<string, string>;
    content: Token[];
    outerSpan: Span;
    innerSpan: Span;
}

export type Token = BBToken | string;

export function isBB(obj: Token): obj is BBToken {
    return typeof obj == "object" 
        && 'name' in obj 
        && 'properties' in obj
        && 'content' in obj;
}

export function parseAll(input: string, names?: string[]): Token[] {
    const treeTokens = TokenizerChain.new(input)
        .tokenize('[')
        .tokenize('(', '{')
        .traverse(parenTreeParser.separateStringLiterals)
        .traverse(parenTreeParser.separateSpaces)
        .get();

    const bbTokenStack: BBToken[] = [];
    bbTokenStack.push({
        name: 'topLevel',
        properties: {},
        content: [],
        outerSpan: { start: 0, end: input.length },
        innerSpan: { start: 0, end: input.length }
    });

    const bbTokenStackTop = () => bbTokenStack[bbTokenStack.length - 1];

    const addStrToken = (end: number) => {
        const top = bbTokenStackTop();
        const lastChild = top.content[top.content.length - 1] as Token | undefined;
        if (typeof lastChild == 'string') {
            return;
        }

        // string token is sliced either starting from after the previous token
        // or, if there are no previous tokens, from the beginning of the parent token content
        let strToken: string;
        if (lastChild != null) {
            strToken = input.slice(lastChild.outerSpan.end, end);
        } else {
            strToken = input.slice(top.innerSpan.start, end);
        }

        if (strToken.length > 0) {
            top.content.push(strToken);
        }
    };

    const findCorrespondingOpeningIndex = (closing: string) => {
        for (let i = bbTokenStack.length - 1; i > 0; i--) {
            if (closing.toLowerCase() == `/${bbTokenStack[i].name.toLowerCase()}`) {
                return i;
            }
        }

        return -1;
    }

    const traverse = traverseDepthFirst(treeTokens);
    let traverseRet = traverse.next();
    while (!traverseRet.done) {
        const treeToken = traverseRet.value;
        tokenBranch: if (treeToken.type == 'tree' && treeToken.surround == '[]') {
            if (treeToken.inner.length == 1 && 
                treeToken.inner[0].type == 'string' && 
                treeToken.inner[0].data.startsWith('/')) {

                const openingIndex = findCorrespondingOpeningIndex(treeToken.inner[0].data);
                if (openingIndex == -1) {
                    break tokenBranch;
                }
                bbTokenStack.splice(openingIndex + 1);

                addStrToken(treeToken.outerSpan.start);
                const newToken = bbTokenStack.pop() as BBToken;
                newToken.outerSpan.end = treeToken.outerSpan.end;
                newToken.innerSpan.end = treeToken.outerSpan.start;

                addStrToken(newToken.outerSpan.start);
                bbTokenStackTop().content.push(newToken);

                traverseRet = traverse.next('skipChildren');
                continue;
            } else {
                const opening = parseBBOpening(treeToken, names);
                if (opening == null) {
                    break tokenBranch;
                }

                addStrToken(opening.outerSpan.start);
                bbTokenStack.push({
                    ...opening,
                    content: [],
                    outerSpan: {
                        start: opening.outerSpan.start,
                        end: -1,
                    },
                    innerSpan: {
                        start: opening.outerSpan.end,
                        end: -1,
                    },
                });

                traverseRet = traverse.next('skipChildren');
                continue;
            }
        }

        traverseRet = traverse.next();
    }

    addStrToken(input.length);

    // convert tags without closing back into text
    while (bbTokenStack.length > 1) {
        const originalOpening = input.slice(bbTokenStackTop().outerSpan.start, bbTokenStackTop().innerSpan.start);
        const token = bbTokenStack.pop() as BBToken;

        bbTokenStackTop().content.push(originalOpening, ...token.content);
    }

    return bbTokenStackTop().content;
}

interface BBOpening {
    name: string;
    arg?: string;
    properties: Record<string, string>;
    outerSpan: Span;
}

function parseBBOpening(input: PTreeToken & { type: 'tree' }, names?: string[]): BBOpening | null {
    const firstChild = input.inner[0];
    if (firstChild == null || firstChild.type != 'string') {
        return null;
    }

    const containsValidOpeningsInside = Array.from(traverseDepthFirst(input))
        .filter(subtoken => subtoken.type == 'tree')
        .map(subtoken => subtoken as PTreeTreeToken)
        .some(subtoken => parseBBOpening(subtoken) != null);

    // I'm going to assume that a valid BBCode opening cannot contain valid BBCode opening inside itself.
    // A world where this assumption is incorrect would be an extremely cursed one
    if (containsValidOpeningsInside) {
        return null;
    }

    const separatedBySpaces: PTreeToken[][] = [];
    let accumulator: PTreeToken[] = [];
    for (const token of input.inner) {
        if (token.type != 'space') {
            accumulator.push(token);
        } else {
            separatedBySpaces.push(accumulator);
            accumulator = [];
        }
    }
    if (accumulator.length != 0) {
        separatedBySpaces.push(accumulator);
    }

    const pairs = separatedBySpaces
        .map(tokens => parenTreeParser.stringify(tokens, 'expandLiterals'))
        .map(word => {
            const eq = word.indexOf('=');
            let key: string;
            let value: string;
            if (eq == -1) {
                key = word;
                value = '';
            } else {
                key = word.slice(0, eq);
                value = word.slice(eq + 1);
            }

            return [ key, value ];
        });

    if (pairs.length > 0 && 
        Array.from(pairs[0][0]).every(c => c.match(/^[a-zA-Z0-0_\-]$/)) &&
        (!names || names.includes(pairs[0][0].toLowerCase()))
       ) {
        return {
            name: pairs[0][0],
            arg: pairs[0][1] || undefined,
            properties: Object.fromEntries(pairs.slice(1)),
            outerSpan: input.outerSpan,
        };
    } else {
        return null;
    }
}

function* traverseDepthFirst(input: PTreeTreeToken | PTreeToken[]): Generator<PTreeToken, undefined, 'skipChildren' | undefined> {
    if ('type' in input && input.type == 'tree') {
        input = input.inner;
    }

    for (const token of input as PTreeToken[]) {
        const continueMode = yield token;
        if (continueMode != 'skipChildren' && token.type == 'tree') {
            for (const child of traverseDepthFirst(token)) {
                yield child;
            }
        }
    }

    return;
}

export function reconstruct(tokens: Token[]): string {
    let output = "";
    for (const token of tokens) {
        if (isBB(token)) {
            const arg = token.arg == null ? "" : `=${token.arg}`;
            let properties = "";
            for (const key in token.properties) {
                const value = token.properties[key];
                const formatted_value = value.includes(' ') ? `"${value}"` : value;
                properties += ` ${key}=${formatted_value}`;
            }
            output += `[${token.name}${arg}${properties}]${reconstruct(token.content)}[/${token.name}]`;
        } else {
            output += token;
        }
    }

    return output
}

// TODO: add unit tests
