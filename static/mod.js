const bb = require('./bb.js')

const { title: TITLE, urlTitle: URL_TITLE } = require('./title.js');
const BASE_URL = `/${URL_TITLE}/`;
const ASSETS_URL = `assets://${URL_TITLE}`;

const mspfacomponent = {
    props: ['tab'],
    title: () => TITLE,

    data: () => ({
        pageRanges: [],
        rangeClass: '',
        baseUrl: BASE_URL,
        assetsUrl: ASSETS_URL,
    }),

    computed: {
        _page() {
            return this.tab.url.substring(`/${URL_TITLE}/`.length);
        },

        page() {
            return Number(this._page);
        },

        isRegularPage() {
            return !isNaN(this.page);
        },

        isLogPage() {
            return this._page == 'log';
        },

        isInfoPage() {
            return this._page == 'info';
        },

        dataIndex() {
            return this.page - 1;
        },

        story() {
            return this.$archive[URL_TITLE];
        },

        pageData() {
            if (this.isLogPage) {
                return {};
            } else {
                return this.story.p[this.dataIndex]
            }
        },

        pageHtml() {
            return bb.bb2html(this.pageData.b);
        },

        commandHtml() {
            return bb.bb2html(this.pageData.c);
        },

        nextCommands() {
            if (this.isRegularPage) {
                return this.pageData.n
                    .map(n => [ n, this.story.p[n - 1].c.trim() ])
                    .map(([n, data]) => ({
                        href: `${BASE_URL}${n}`,
                        html: bb.bb2html(data),
                    }));
            } else {
                return [];
            }
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

        updateRangeClass() {
            const range = this.pageRanges
                .filter(({from, to}) => this.page >= from && this.page <= to)
                .map(({from, to}) => from == to ? `p${from}` : `p${from}-${to}`)
                .join(' ');

            this.rangeClass = range;
        },
    },

    mounted() {
        this.setButtonEvents();

        let adventureStyle = document.querySelector(`style#style-mspfa-${this.story.i}`);
        if (adventureStyle == null) {
            let css = this.story.y
                .replace(/body/g, '.mspfa-body')
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

        this.pageRanges = ranges;
        this.updateRangeClass();

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
    },

    updated() {
        this.setButtonEvents();
        this.updateRangeClass();
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
                    thumbsrc: story.o,
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
