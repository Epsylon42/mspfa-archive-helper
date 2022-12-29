class ParserInput {
    constructor(data, offset) {
        this.data = data;
        this.offset = offset || 0;
    }

    split(at) {
        let left = new ParserInput(this.data.slice(0, at), this.offset);
        let right = new ParserInput(this.data.slice(at), this.offset + at);

        let ret = [left, right];

        ret.left = function() { return this[0]; };
        ret.right = function() { return this[1]; };

        return ret;
    }
}


class ParserError extends Error {
    constructor(input, message, prev, custom) {
        super(message);

        this.input = input;
        this.prev = prev;
        this.custom = custom;

        if (prev) {
            this.depth = prev.depth;
        } else {
            this.depth = 0;
        }
    }

    root_custom_error() {
        if (this.prev) {
            const rce = this.prev.root_custom_error();
            if (rce) {
                return rce;
            }
        }

        if (this.custom) {
            return this;
        } else {
            return null;
        }
    }
}


class Rule {
    hide() {
        this.hidden = true;
        return this;
    }

    map(func) {
        return new Map(this, func);
    }

    flatten() {
        return this.map(m => m[0])
    }

    err_msg(msg) {
        this.msg = msg;
        return this;
    }
    set_expectation(ex) {
        this.expectation = ex;
    }
    expects() {
        return this.expectation;
    }
    error(input, prev) {
        throw new ParserError(
            input,
            this.msg || this.expects(),
            prev,
            this.msg != null
        );
    }


    named(...names) {
        return new Map(this, arr => {
            let obj = {};

            names.forEach((name, i) => {
                obj[name] = arr[i];
            });

            return obj;
        });
    }

    branch(name) {
        return new Map(this, res => ({
            branch: name,
            value: res,
        }));
    }

    opt() {
        return new Many(this)
            .at_most(1)
            .map((arr) => arr.length === 0 ? null : arr[0]);
    }

    parse(input) {
        try {
            return this._parse(input);
        } catch (e) {
            if (e instanceof ParserError) {
                this.error(input, e);
            } else {
                throw e;
            }
        }
    }
}

class Exact extends Rule {
    constructor(word) {
        super();

        this.word = word
        this.set_expectation("'" + word + "'");
    }

    ignore_case() {
        this._ignore_case = true;
        return this;
    }

    _parse(input) {
        let matches = null;

        if (this._ignore_case) {
            const lc = this.word.toLowerCase();
            matches = lc === input.data.slice(0, lc.length).toLowerCase();
        } else {
            matches = input.data.startsWith(this.word);
        }

        if (matches) {
            let [result, rest] = input.split(this.word.length)
            return [result.data, rest];
        } else {
            this.error(input);
        }
    }
}

class RuleHelper extends Rule {
    chain(func) {
        return this.with(func(new Chain()));
    }
    chain_hidden(func) {
        return this.with_hidden(func(new Chain()));
    }

    either(func) {
        return this.with(func(new Either()));
    }
    either_hidden(func) {
        return this.with_hidden(func(new Either()));
    }
}

class Chain extends RuleHelper {
    constructor() {
        super();

        this.parsers = [];
    }

    with(parser) {
        this.parsers.push(to_parser(parser));
        if (this.spaces) {
            this.with_spaces();
        }
        return this;
    }
    with_hidden(parser) {
        this.parsers.push(to_parser(parser).hide());
        if (this.spaces) {
            this.with_spaces();
        }
        return this;
    }

    with_spaces() {
        this.parsers.push(new Spaces().hide());
        return this;
    }

    interleave_spaces() {
        this.spaces = true;
        if (this.parsers.length === 0 ||
            !(this.parsers[this.parsers.length] instanceof Spaces)) {

            this.with_spaces();
        }
        return this;
    }

    no_interleave_spaces() {
        this.spaces = false;
        if (this.parsers.length !== 0 &&
            this.parsers[this.parsers.length] instanceof Spaces) {

            this.parsers.pop();
        }
        return this;
    }

    _parse(input) {
        return this.parsers.reduce(
            ([done, rest], parser, index) => {
                try {
                    let [result, new_rest] = parser.parse(rest);
                    if (!parser.hidden) {
                        done.push(result);
                    }
                    return [done, new_rest];
                } catch (e) {
                    if (e instanceof ParserError) {
                        let additional_depth = 0;
                        for (let i = 0; i < index; i++) {
                            let elem = this.parsers[i];
                            if (elem instanceof Spaces) {
                                continue;
                            }
                            if (elem instanceof Map) {
                                elem = elem.parser;
                            }
                            if (elem instanceof Many) {
                                if (elem.at_least_n == 0 && elem.at_most_n == 1) {
                                    continue;
                                }
                            }
                            additional_depth += 1;
                        }
                        e.depth += additional_depth;
                    }
                    throw e;
                }
            },
            [[], input]
        );
    }
}

class Many extends Rule {
    constructor(parser) {
        super();

        this.parser = to_parser(parser);
        this.at_least_n = 0;
        this.at_most_n = null;
    }

    at_least(n) {
        this.at_least_n = n;
        return this;
    }

    at_most(n) {
        this.at_most_n = n;
        return this;
    }

    got_enough(results) {
        return results.length >= this.at_least_n;
    }

    got_maximum(results) {
        if (this.at_most_n == null) {
            return false;
        } else {
            return results.length >= this.at_most_n;
        }
    }

    _parse(input) {
        let results = [];

        let prev_error = null;

        try {
            while (true) {
                let [result, rest] = this.parser.parse(input);
                results.push(result);
                if (rest.offset === input.offset) {
                    break;
                }
                input = rest;

                if (this.got_maximum(results)) {
                    break;
                }
            }
        } catch (e) {
            if (!(e instanceof ParserError)) {
                throw e;
            } else {
                prev_error = e;
                prev_error.depth += results.length;
            }
        }

        if (!this.got_enough(results)) {
            this.error(input, prev_error);
        }

        return [results, input];
    }
}

class Either extends RuleHelper {
    constructor() {
        super();

        this.either = [];
    }

    with(parser) {
        this.either.push(to_parser(parser));
        return this;
    }

    with_hidden(parser) {
        this.either.push(to_parser(parser).hide());
        return this;
    }

    _parse(input) {
        if (this.either.length === 0) {
            throw new Error('Either rule must have at least one variant');
        }

        let errors = [];

        for (const parser of this.either) {
            try {
                return parser.parse(input);
            } catch (e) {
                if (e instanceof ParserError) {
                    errors.push(e);
                } else {
                    throw e;
                }
            }
        }

        const max_depth = errors
            .map(e => e.depth)
            .reduce((a, b) => a > b ? a : b, 0);
        const unfiltered_len = errors.length;
        errors = errors
            .filter(e => e.depth == max_depth);
        if (errors.length == 0) {
            this.error(input);
        } else if (errors.length == 1) {
            this.error(input, errors[0]);
        } else {
            let messages = errors
                  .map(e => {
                      const rce = e.root_custom_error();
                      return rce ? [rce.message, true] : [e.message, false];
                  });
            const custom = messages
                  .filter(([, custom]) => custom)
                  .length > 0;
            messages = messages
                .map(([msg,]) => msg)
                .join(" or ");
            throw new ParserError(input, `one of (${messages})`, null, custom);
        }
    }
}

class Spaces extends Rule {
    constructor() {
        super();
        this.set_expectation('spaces');
        this.hide();
    }

    _parse(input) {
        let spaces = input.data.match(/^\s*/);
        if (spaces) {
            return [spaces[0], input.split(spaces[0].length).right()];
        }
        else {
            return ['', input];
        }
    }
}

class Map extends Rule {
    constructor(parser, func) {
        super();

        this.parser = to_parser(parser);
        this.func = func;
    }

    _parse(input) {
        let [result, rest] = this.parser.parse(input);
        return [this.func(result), rest];
    }
}

class Pred extends Rule {
    constructor(pred, eoi, peek) {
        super();

        this.pred = pred;
        this.eoi = eoi;
        this.peek = peek;
        this.set_expectation('character matching a predicate');
    }

    _parse(input) {
        if ((!this.eoi && input.data[0] === undefined) || !this.pred(input.data[0])) {
            this.error(input);
        } else {
            if (this.peek) {
                return ['', input];
            } else {
                return [input.data[0], input.split(1).right()];
            }
        }
    }

    static eoi() {
        return new Pred(x => x === undefined, true).err_msg('end of input');
    }
}

class Regex extends Rule {
    constructor(regex) {
        super();

        let str = String(regex);
        str = str.slice(1);
        str = str.slice(0, str.length-1);
        if (!str.startsWith('^')) {
            str = '^' + str;
        }

        this.regex = RegExp(str);
        this.set_expectation(`regex ${regex}`);
    }

    _parse(input) {
        let matches = input.data.match(this.regex);
        if (matches) {
            return [matches, input.split(matches[0].length).right()];
        } else {
            this.error(input);
        }
    }
}

function surround(opening, closing, parser) {
    return new Chain()
        .with_hidden(opening)
        .with(parser)
        .with_hidden(closing)
        .map(m => m[0]);
}

function to_parser(x) {
    if (typeof(x) !== 'object') {
        return new Exact(String(x));
    } else if (x instanceof Rule) {
        return x;
    } else if (x instanceof RegExp) {
        return new Regex(x).map(m => m[0]);
    } else {
        throw new Error('Not a parser');
    }
}

module.exports = {
    ParserError,
    ParserInput,
    Rule,
    Exact,
    Chain,
    Many,
    Either,
    Spaces,
    Map,
    Pred,
    Regex,
    surround
};
