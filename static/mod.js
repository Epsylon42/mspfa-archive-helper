const bb = require('./bb/bb2html')

const TITLE = 'TestQuest';

const URL_TITLE = TITLE.toLowerCase().replace(/ /g, '-');
const BASE_URL = `/${URL_TITLE}/`;
const ASSETS_URL = `assets://${URL_TITLE}`;

const mspfacomponent = {
    props: ['tab'],
    title: () => TITLE,

    data: () => ({
        pageRanges: [],
        bodyClass: '',
        baseUrl: BASE_URL,
    }),

    computed: {
        page() {
            return Number(this.tab.url.substring(`/${URL_TITLE}/`.length));
        },

        specialPage() {
            return this.tab.url.substring(`/${URL_TITLE}/`.length);
        },

        dataIndex() {
            return this.page - 1;
        },

        story() {
            return this.$archive[URL_TITLE];
        },

        pageData() {
            if (this.specialPage == 'log') {
                return {};
            } else {
                return this.story.p[this.dataIndex]
            }
        },

        pageHtml() {
            return bb.bb2html(this.pageData.b)
                .replace(/@@ASSETS@@/g, ASSETS_URL);
        },
    },

    methods: {
        timestampToISO,

        setButtonEvents() {
            for (const button of this.$refs.content.querySelectorAll('.spoiler button')) {
                button.onclick = 
                    function() {
                        if(this.parentNode.parentNode.classList.contains('closed')) {
                            this.innerText = this.getAttribute('data-close');
                            this.parentNode.parentNode.classList.remove('closed');
                            this.parentNode.parentNode.classList.add('open');
                        } else if(this.parentNode.parentNode.classList.contains('open')) {
                            this.innerText = this.getAttribute('data-open');
                            this.parentNode.parentNode.classList.remove('open');
                            this.parentNode.parentNode.classList.add('closed');
                        }
                    };
            }
        },

        updateBodyClass() {
            const range = this.pageRanges
                .filter(({from, to}) => this.page >= from && this.page <= to)
                .map(({from, to}) => from == to ? `p${from}` : `p${from}-${to}`)
                .join(' ');

            this.bodyClass = `mspfa-body ${range}`;
        },

        updateOverlay() {
            const overlay = document.querySelector('#overlay');
            if (overlay) {
                let overlayAmt = parseInt(overlay.getAttribute('data-amt'));
                if (isNaN(overlayAmt)) overlayAmt = 1;
                for (let i = 0; i < overlayAmt; i++) {
                    const newChild = document.createElement('div');
                    newChild.className = `overlay-${i+1}`;
                    overlay.appendChild(newChild);
                }
                document.querySelector('#container').appendChild(overlay);
            }

            //console.log("Image Overlay by seymour schlong -https://mspfa.com/?s=37172");
        }
    },

    mounted() {
        this.setButtonEvents();

        let adventureStyle = document.querySelector(`style#style-mspfa-${this.story.i}`);
        if (adventureStyle == null) {
            let css = this.story.y
                .replace(/@@ASSETS@@/g, ASSETS_URL)
                .replace(/body/g, '.mspfa-body')
                .replace(/background-image/g, 'background');
            adventureStyle = document.createElement('style');
            adventureStyle.innerHTML = css;
            adventureStyle.id = `style-mspfa-${this.story.i}`;
            document.head.appendChild(adventureStyle);
        }

        const pageRangeRegex = /p(\d+)-(\d+)/;
        const pageRegex = /p(\d+) /;
        
        const ranges = [];
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule instanceof CSSStyleRule) {
                        let match = rule.selectorText.match(pageRangeRegex)
                        if (!match) {
                            match = rule.selectorText.match(pageRegex);
                        }
                        if (match) {
                            const from = Number(match[1]);
                            const to = Number(match[2] || match[1]);
                            const prev = ranges[ranges.length - 1];
                            if (!prev || prev.from != from || prev.to != to) {
                                ranges.push({ from, to });
                            }
                        }
                    }
                }
            } catch (e) {};
        }

        console.log(ranges);
        this.pageRanges = ranges;
        this.updateBodyClass();

        this.$refs.mspfa_container.addEventListener('keydown', e => {
            switch (e.code) {
                case 'Space':
                    const button = this.$refs.mspfa_container.querySelector('.spoiler button')
                    if (button) {
                        button.click();
                    }
                    break;
                case 'ArrowRight':
                    if (this.page != this.story.p.length - 1) {
                        this.tab.url = `${BASE_URL}${this.page + 1}`;
                        this.$refs.mspfa_container.parentElement.scrollTo(0, 0);
                    }
                    break;
                case 'ArrowLeft':
                    if (this.page != 1) {
                        this.tab.url = `${BASE_URL}${this.page - 1}`;
                        this.$refs.mspfa_container.parentElement.scrollTo(0, 0);
                    }
                    break;
            }
        });

        this.updateOverlay();
    },

    updated() {
        this.setButtonEvents();
        this.updateBodyClass();
        this.updateOverlay();
    },
}

function makeRoutes(api) {
    const entries = api.readFile('./assets/index').split('\n');
    const routes = Object.fromEntries(new Map(
        entries.map(file => [ `${ASSETS_URL}/${file}`, `./assets/${file}` ])
    ));
    return routes;
}

function timestampToISO(timestamp) {
    return new Date(timestamp).toISOString().split('T')[0];
}

module.exports = {
    title: TITLE,

    edit: true,
    routes: true,

    computed(api) {
        return {
            routes: makeRoutes(api),

            edit(archive) {
                const story = JSON.parse(api.readFile('./story.json'))

                archive.tweaks.modHomeRowItems.unshift({
                    href: `${BASE_URL}1`,
                    thumbsrc: story.o.replace(/@@ASSETS@@/, ASSETS_URL),
                    title: story.n,
                    description: story.r,
                    date: `${timestampToISO(story.d)} - ${timestampToISO(story.u)}`,
                })

                archive[URL_TITLE] = story;
            },

            browserPages: {
                [URL_TITLE.toUpperCase()]: {
                    component: {
                        ...mspfacomponent,
                        template: api.readFile('./template.vue'),
                    }
                }
            }
        }
    }
}
