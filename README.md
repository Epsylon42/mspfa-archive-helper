# mspfa-archive-helper

Tool to archive fanventures from [mspfa.com](https://mspfa.com) and package them into mods for the [UHC](https://github.com/Bambosh/unofficial-homestuck-collection)

## Usage

    npm install
    npm run build

Then

    npm start -- --story <story-id>

Or

    npm start -- --help

for the full description

The double dash after `start` is ugly, but it does not seem possible to allow skipping it, at least with `npm`

Run it only when current directory is the repository root. I have not tested otherwise and Do Not Know how it will behave.

mspfa-archive-helper uses [microlinkhq/youtube-dl-exec](https://github.com/microlinkhq/youtube-dl-exec), which automatically downloads yt-dlp. If you don't want that, check their [section about environment variables](https://github.com/microlinkhq/youtube-dl-exec#environment-variables) before running `npm install`.

### Non-Obvious things that it does handle

* Custom CSS, including CSS imports and per-page styles.
    * (Mostly. See TODOs)
* CSS is scoped so it does not fuck up the other UHC tabs when loaded
* Videos hosted on YouTube
* HTML elements with `src="..."` (`embed`, `video`, `audio`, `img`, etc)
* Incremental updates
    * Files are not downloaded if the tool determines that it's already present. If you know some files have changed - delete them and run the tool again

### Things that it does not (currently?) handle

* Custom JavaScript
    * Archiving JS, including imports, may be doable. Automatically adapting it to run in UHC - may or may not be
    * It's possible to add manually. See branch `mspfa-37172-overlay` for an example of that
* iframes (except youtube)
* See TODOs
    * Some bbcodes
    * Some weird CSS things
    * Links to other mspfa pages
* Probably some other things that I don't know about yet

## TODOs:

* Implement all bbcodes (surely there must be a list of them somewhere)
* Some images on MSPFA have `class="major"` which makes them take up the whole width of the slide. As far as I can tell, it's not specified in bbcodes, nor anywhere else. Figure out what's up with that
* MSPFA uses classes like `p<x>-<y>` to apply styles on a per-page basis. Additionaly, some fanventures specify something like `@pagegroup <name> <x1>-<y1> <x2>-<y2> ...` in their custom css, which adds `<name>` along with `p<x>-<y>` to the list of classes. Support that. (e.g. 47866)
* Additionaly, the previous point does not seem like standard CSS. There may be other similar features on MSPFA
* Some adventures use `.p<x>-<y> { --theme: @import url("...") }` to apply styles. `css-tree` does not recognise the url and treats the whole value as a string, so this case needs to be implemented explicitly. (e.g. 48662)
* The tool uses a bespoke parser for bbcodes. If there is a library that actually returns the AST, and does not just spit out HTML, it might be better to use it.
* Find and convert links of the format `mspfa.com?s=<story>&p=<page>`, at least for cases where `<story>` equals the current story id
    * Maybe also links to `homestuck.com` and `mspaintadventures.com`
* fetchFile should correctly process relative links when downloading recursively (which might involve domains other than mspfa.com)
