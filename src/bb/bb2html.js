const bb = require('./bbparser');

function tokens2html(tokens, toplevel = true) {
    const output = [];
    for (const token of tokens) {
        if (bb.isBB(token)) {
            const content = tokens2html(token.content, false);
            if (["b", "i", "u", "center"].includes(token.name)) {
                output.push(`<${token.name}>${content}</${token.name}>`);
            }
            else if (token.name == "color") {
                output.push(`<span style="color: ${token.arg}">${content}</span>`);
            } else if (token.name == "size") {
                output.push(`<span style="font-size: ${token.arg}pt">${content}</span>`);
            } else if (token.name == "img") {
                const classname = toplevel ? 'class="major"' : '';
                if (token.arg != null) {
                    const [width, height] = token.arg.split('x');
                    output.push(`<img src="${content}" ${classname} width="${width}" height=${height}><br>`);
                } else {
                    output.push(`<img src="${content}" ${classname}>`);
                }
            } else if (token.name == "spoiler") {
                output.push(`<div class="spoiler closed"><div style="text-align: center"><button data-open="${token.properties.open}" data-close=${token.properties.close}>${token.properties.open}</button></div><div>${content}</div></div>`);
            } else if (token.name == "url") {
                output.push(`<a href="${token.arg}">${content}</a>`);
            } else {
                output.push(`<${token.name}>${content}</${token.name}>`);
            }
        } else {
            output.push(token);
        }
    }

    return output.join('').replace(/\n/g, "<br>");
}

function bb2html(data) {
    const tokens = bb.parseAll(data);
    return tokens2html(tokens);
}

exports.bb2html = bb2html
