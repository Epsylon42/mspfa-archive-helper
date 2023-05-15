import { parse as parseHtml, HTMLElement } from 'node-html-parser'

import { story, assetsDir, mspfaUrl } from './index.mjs';
import { fetchFile, fetchYoutube, toAssetUrl } from './fetch.mjs';
import { archiveCssString } from './archiveCss.mjs'

///
/// Traverses the pages, parses html and downloads things:
///     * elements with 'src' attribute
///     * YouTube iframes
///     * URLs from inline css
///
export async function archiveHtmlElements() {
    console.log('fixing html');

    let otherResIndex = 0;
    for (let page = 1; page <= story.p.length; page += 1) {
        const html = parseHtml(story.p[page - 1].b);
        let videoIndex = 1;

        for (const el of html.querySelectorAll('[src]')) {
            const src = new URL(el.getAttribute('src') as string, mspfaUrl);

            let assetUrl;
            if (el.tagName == 'IFRAME') {
                if (src.hostname.includes('youtube.com') || src.hostname.includes('youtu.be')) {
                    console.log(`downloading video for page ${page} from ${src.href}`);
                    const indexStr = videoIndex == 0 ? '' : `_${videoIndex}`;
                    assetUrl = toAssetUrl(await fetchYoutube(src, `${assetsDir}/videos/${page}${indexStr}`));
                    videoIndex += 1;

                    const newEl = new HTMLElement('video', {}, '', null, [0, 0]);
                    newEl.classList.add('major');
                    newEl.setAttribute('src', assetUrl);
                    newEl.setAttribute('controls', 'controls');
                    newEl.setAttribute('controlslist', 'nodownload');
                    newEl.setAttribute('disablepictureinpicture', '');
                    for (const attrKey of ['width', 'height']) {
                        const attr = el.getAttribute(attrKey);
                        if (attr != null) {
                            newEl.setAttribute(attrKey, attr);
                        }
                    }
                    el.replaceWith(newEl);
                } else {
                    console.error(`found iframe that is not a youtube video on page ${page} - not supported - skipping`);
                    continue;
                }
            } else {
                assetUrl = toAssetUrl(await fetchFile(src, `${assetsDir}/otherres/`, { fallbackName: String(otherResIndex) }));
                el.setAttribute('src', assetUrl);
                otherResIndex += 1;
            }
        }

        for (const el of html.querySelectorAll('[style]')) {
            let style = el.getAttribute('style') as string;
            style = await archiveCssString(style, { context: 'declarationList' });
            el.setAttribute('style', style);
        }

        story.p[page - 1].b = html.toString();
    }
}
