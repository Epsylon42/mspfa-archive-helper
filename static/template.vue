<template>
<div :class="`mspfa-${story.i}`" tabindex="0" ref="mspfa_container">

    <div>
        <link rel="stylesheet" :href="`${assetsUrl}/mspfa.css`">
    </div>

    <div :class="rangeClass" style="height: 100%">
        <div class="mspfa-body">
            <div id="main">
                <header>
                    <nav>
                        <a href="/" style="color: #ffffff;">Homestuck Collection</a>
                        <span class="vbar">|</span>
                        <a href="https://mspfa.com/" target="_blank" style="color: #ffffff;">MSPFA</a>
                        <div class="heart"></div>
                        <a  style="color: #76d8ff;">Explore</a>
                        <span class="vbar">|</span>
                        <a  style="color: #76d8ff;">Random</a>
                        <span class="vbar">|</span>
                        <a  style="color: #76d8ff;">Statistics</a>
                        <div class="heart"></div>
                        <a :href="baseUrl + 'log'" style="color: #2cff4b;">Log</a>
                        <span class="vbar">|</span>
                        <a style="color: #2cff4b;">Search</a>
                        <div class="heart"></div>
                        <a style="color: #fffa36;">My MSPFA</a>
                        <a id="notification" style="display: none;">0</a>
                        <span class="vbar">|</span>
                        <a href="https://discord.gg/EC5acgG" target="_blank" style="color: #fffa36;">Discord</a>
                        <div class="heart"></div>
                        <a style="color: #ffbc3e;">Donate</a>
                        <span class="vbar">|</span>
                        <a style="color: #ffbc3e;">More</a>
                    </nav>
                </header>
                <div id="container">
                    <div id="slide">
                        <div id="command">{{ pageData.c }}</div>
                        <div v-if="specialPage != 'log'" id="content" ref="content" v-html="pageHtml"></div>
                        <table v-if="specialPage == 'log'" id="log" ref="content">
                            <tr id="pages">
                                <td>
                                    <span v-for="(p, i) in story.p">
                                        {{ timestampToISO(p.d) }} - <a :href="baseUrl + (i + 1)">{{ p.c }}</a><br>
                                    </span>
                                </td>
                            </tr>
                        </table>
                        <div id="foot">
                            <div id="links">
                                <a v-for="n in pageData.n" :href="baseUrl + n">{{ story.p[n - 1].c.trim() }}</a>
                            </div>
                            <br>
                            <br>
                            <div id="prevlinks" style="display: flex">
                                <div class="footlinks">
                                    <a id="startover" :href="baseUrl + 1">Start Over</a>
                                    <span v-if="page > 1"> | <a id="goback" :href="baseUrl + (page - 1)">Go Back</a> </span>
                                </div>
                                <div class="footlinks" style="margin-left: auto; color: grey;" v-if="specialPage != 'log'">
                                    {{ timestampToISO(pageData.d) }}
                                </div>
                            </div>
                            <br>
                            <br>
                        </div>
                    </div>
                    <div id="info"></div>
                </div>
                <footer>
                    <div class="umcontainer">
                        <div class="mspfalogo"></div>
                        <form id="dialog" style="display: none;">
                            <div class="major"></div>
                            <div></div>
                            <div></div>
                        </form>
                    </div>
                </footer>
            </div>
        </div>
    </div>
</div>
</template>
