import * as path from 'path';
import * as csst from 'css-tree';
import { fs } from 'zx';

import { mspfaUrl, assetsDir, storyId, toAssetUrl } from './index.mjs'
import { fetchFile, FetchResult } from './fetch.mjs'

let cssResIndex = 0;

async function archiveUrl(url: URL, fallbackName: string): Promise<FetchResult> {
    return await fetchFile(url, `${assetsDir}/cssres/${encodeURIComponent(url.host)}/`, { fallbackName });
}

function collectUrls(node: any) : any[] {
    let urls: any[] = [];
    if (node == null || typeof(node) != 'object') {
        return urls;
    }

    if (node.type == 'Url') {
        urls.push(node);
    }
    if ('children' in node && node.children != null) {
        urls = urls.concat(node.children.toArray().flatMap(collectUrls));
    }
    for (const key of ['value', 'prelude', 'block']) {
        urls = urls.concat(collectUrls(node[key]));
    }

    return urls;
}

async function archiveCssRecursive(filePath: string) {
    console.log(`${filePath} is a css file - downloading recursively`);
    try {
        let content: string;
        if (await fs.pathExists(`${filePath}.orig`)) {
            content = (await fs.readFile(`${filePath}.orig`)).toString();
        } else {
            content = (await fs.readFile(filePath)).toString();
            await fs.writeFile(`${filePath}.orig`, content);
        }

        const archived = await archiveCssString(content);
        await fs.writeFile(filePath, archived);
    } catch (e) {
        console.error(`Could not download ${filePath} - ${e}`)
    }
}

function applyCssScope(rule: csst.Rule) {
    if (rule.prelude.type == 'Raw') {
        return;
    }

    for (const _selector of rule.prelude.children) {
        if (_selector.type != 'Selector') {
            continue;
        }
        const selector = _selector as csst.Selector;
        if ((selector.children.first as any)?.name != `mspfa-${storyId}`) {
            selector.children.unshift({ type: 'Combinator', name: ' '});
            selector.children.unshift({ type: 'ClassSelector', name: `mspfa-${storyId}` });
        }
    }
}

export async function applyCssScopeToFile(filePath: string) {
    const content = (await fs.readFile(filePath)).toString();
    let css: any = csst.parse(content, {
        parseRulePrelude: true,
        parseCustomProperty: false,
        parseValue: false,
        parseAtrulePrelude: false,
    });
    css.children.forEach(applyCssScope);
    await fs.writeFile(filePath, csst.generate(css));
}

export async function archiveCssString(
    cssString: string,
    args: { download?: boolean, context?: string } = {}
): Promise<string> {
    let { download = true, context = 'default' } = args;

    let css: any = csst.parse(cssString, {
        context,
        parseRulePrelude: true,
        parseCustomProperty: true,
    });

    for (const rule of css.children) {
        if (download) {
            let values = collectUrls(rule);

            for (const value of values) {
                let result;
                try {
                    result = await archiveUrl(new URL(value.value, mspfaUrl), String(cssResIndex));
                    const assetUrl = toAssetUrl(result);
                    value.value = assetUrl;
                } catch (e) {
                    console.error(e);
                    continue;
                }

                if (result.path != null && path.extname(result.path) == '.css') {
                    await archiveCssRecursive(result.path);
                }

                cssResIndex += 1;
            }
        }

        if (rule.type == 'Rule') {
            applyCssScope(rule);
        }
    }

    return csst.generate(css);
}

export async function archiveStoryCss(story: { y: string }) {
    console.log('downloading css resources');
    story.y = await archiveCssString(story.y);
}

