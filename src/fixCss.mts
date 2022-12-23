import * as path from 'path';
import * as csst from 'css-tree';
import { fs } from 'zx';

import { mspfaUrl, assetsDir, storyId } from './index.mjs'
import { fetchFile } from './fetch.mjs'

let cssResIndex = 0;

async function fixUrl(url: URL, fallbackName: string): Promise<string> {
    if (url.pathname.includes('FONT_URL')) {
        return url.href;
    }
    return await fetchFile(url, `${assetsDir}/cssres/`, { fallbackName });
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
    if ('value' in node) {
        urls = urls.concat(collectUrls(node.value));
    }

    return urls;
}

async function fixCssRecursive(filePath: string) {
    console.log(`${filePath} is a css file - fixing recursively`);
    try {
        const content = (await fs.readFile(filePath)).toString();
        const fixed = await fixCssString(content, false);
        await fs.writeFile(filePath, fixed);
    } catch (e) {
        console.error(`Could not fix ${filePath} - ${e}`)
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

export async function scopeCssFile(filePath: string) {
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

export async function fixCssString(cssString: string, download: boolean = true): Promise<string> {
    let css: any = csst.parse(cssString, {
        parseRulePrelude: true,
        parseCustomProperty: false,
    });

    for (const rule of css.children) {
        if (download) {
            let values = collectUrls(rule.prelude).concat(collectUrls(rule.block));

            for (const value of values) {
                const filePath = await fixUrl(new URL(value.value, mspfaUrl), String(cssResIndex));
                if (path.extname(filePath) == '.css') {
                    await fixCssRecursive(filePath);
                }

                const assetUrl = filePath.replace(assetsDir, '@@ASSETS@@');
                value.value = assetUrl;
                cssResIndex += 1;
            }
        }

        if (rule.type == 'Rule') {
            applyCssScope(rule);
        }
    }

    return csst.generate(css);
}

export async function fixStoryCss(story: { y: string }) {
    console.log('downloading css resources');
    story.y = await fixCssString(story.y);
}

