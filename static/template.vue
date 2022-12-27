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
                        <span class="vbar">|</span>
                        <a :href="baseUrl + 'info'" style="color: #2cff4b;">Info</a>
                        <div class="heart"></div>
                        <a style="color: #fffa36;">My MSPFA</a>
                        <a id="notification" style="display: none;">0</a>
                        <span class="vbar">|</span>
                        <a target="_blank" style="color: #fffa36;">Discord</a>
                        <div class="heart"></div>
                        <a style="color: #ffbc3e;">Donate</a>
                        <span class="vbar">|</span>
                        <a style="color: #ffbc3e;">More</a>
                    </nav>
                </header>
                <div id="container">
                    <div id="slide">

                        <div id="command" v-if="isRegularPage" v-html="commandHtml"></div>
                        <div id="command" v-if="isLogPage">Story Log</div>

                        <div v-if="isRegularPage" id="content" ref="content" v-html="pageHtml"></div>

                        <div v-if="isLogPage" id="log" ref="content">
                            <div id="pages">
                                    <span v-for="(p, i) in story.p">
                                        {{ timestampToISO(p.d) }} - <a :href="baseUrl + (i + 1)">{{ p.c }}</a><br>
                                    </span>
                            </div>
                        </div>

                        <div v-if="isInfoPage" id="info">
                            <div class="storyicon">
                                <img :src="story.o" width="150" height="150">
                            </div>
                            <div class="general-info">
                                <div class="title">{{ story.n }}</div>
                                <div class="author">Author: <a class="authorlink" :href="story.w">{{ story.a }}</a></div>
                                <div class="tags">
                                    Tags: <span class="tag" v-for="(tag, i) in story.t">{{ tag + (i < story.t.length - 1 ? ', ' : '') }}</span>
                                </div>
                            </div>
                            <div class="log-link">
                                <a :href="baseUrl + 'log'">View All Pages</a>
                            </div>
                            <div class="description">{{ story.r }}</div>
                        </div>

                        <div v-if="isRegularPage" id="foot">
                            <div id="links">
                                <a v-for="next in nextCommands" :href="next.href" v-html="next.html"></a>
                            </div>
                            <br>
                            <br>
                            <div id="prevlinks" style="display: flex">
                                <div class="footlinks">
                                    <a id="startover" :href="baseUrl + 1">Start Over</a>
                                    <span v-if="page > 1"> | <a id="goback" :href="baseUrl + (page - 1)">Go Back</a> </span>
                                </div>
                                <div class="footlinks" style="margin-left: auto; color: grey;" v-if="isRegularPage">
                                    {{ timestampToISO(pageData.d) }}
                                </div>
                            </div>
                            <br>
                            <br>
                        </div>
                    </div>
                </div>
                <footer>
                    <!-- This is not, in fact, a header, but the actual header does not exist so we'll put it here -->
                    <header class="umcontainer">
                        <div class="mspfalogo"></div>
                    </header>
                </footer>
            </div>
        </div>
    </div>
</div>
</template>
