const { Chain, Many, Pred, Either, Regex, Spaces, surround, ParserInput } = require('./parser')

function name(names) {
    if (names != null) {
        let either = new Either();
        for (const name of names) {
            either.with(name);
        }
        
        return either
    } else {
        return new Regex(/\w*/)
            .map(m => m[0])
            .err_msg("name");
    }
}

function unquotedValue() {
    const innerEither = new Either();

    const parens = new Chain()
        .with('(')
        .with(new Many(innerEither).map(m => m.join('')))
        .with(')')
        .map(m => m.join(''));

    innerEither
        .with(new Pred(c => ! ['(', ')', ']'].includes(c)))
        .with(parens);

    return new Many(
        new Either()
            .with(parens)
            .with(new Pred(c => c != ' ' && c != ']'))
        )
        .map(m => m.join(''));
}

function openingTagParser(names) {
    function value() {
        return new Either()
        .with(
            new Chain()
            .with_hidden('=')
            .with(surround('"', '"', new Many(new Pred(c => c != '"')).map(m => m.join(''))))
            .map(m => m[0])
        )
        .with(
            new Chain()
            .with_hidden('=')
            .with(unquotedValue())
            .map(m => m[0])
        );
    }

    return surround('[', ']', 
        new Chain()
        .with(name(names))
        .with(value().opt())
        .with_hidden(new Spaces())
        .with(
            new Many(new Chain()
                .with_hidden(new Spaces())
                .with(name())
                .with(value())
            ).map(m => Object.fromEntries(new Map(m)))
        )
    ).map(m => ({
        name: m[0],
        arg: m[1],
        properties: m[2],
    }))
}

function parseOne(input, names) {
    for (let at = 0; at < input.length;) {
        const opening = input.indexOf('[', at);
        if (opening == -1) {
            return { bb: null, before: input, after: "" };
        }

        try {
            const [result, { data: rest }] = openingTagParser(names).parse(new ParserInput(input.substring(opening)));

            const closing = `[/${result.name}]`;
            const closing_pos = rest.indexOf(closing);
            if (closing_pos == -1) {
                throw new Error();
            }

            return {
                bb: {
                    ...result,
                    content: parseAll(rest.substring(0, closing_pos)),
                },
                before: input.substring(0, opening),
                after: rest.substring(closing_pos + closing.length),
            }
        } catch (e) {}

        at = opening + 1;
    }

    return { bb: null, before: input, after: "" };
}

function parseAll(input, names) {
    const tokens = [];

    while (input.length != 0) {
        const { bb, before, after } = parseOne(input, names);
        tokens.push(before);
        if (bb != null) {
            tokens.push(bb);
        }

        input = after;
    }

    return tokens.filter(t => t != '');
}

function isBB(token) {
    return typeof token == "object" && token.name != undefined && token.content != undefined;
}

function reconstruct(tokens) {
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

function flattenDestructive(tokens) {
    return tokens
        .filter(isBB)
        .flatMap(t => {
            const children = flattenDestructive(t.content);
            t.content = t.content.filter(ct => !isBB(ct)).join('');
            return [t].concat(children);
        });
}

module.exports = { parseAll, isBB, reconstruct, flattenDestructive };
