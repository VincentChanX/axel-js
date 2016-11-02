#!/usr/bin/env node

'use strict';

var optParser = new(require('option-parser'))();
var axel = require('../lib/axel');
var constants = require('../lib/constants');
var fmt = require('../lib/fmt');

var options = {
        numConnections: constants.DEFAULT_NUM_CONNECTIONS,
        verbose: false,
        quiet: false,
        output: null,
        header: []
    },
    link;

optParser.addOption('n', 'num-connections', 'Specify maximum number of connections').argument('<NUM-CONNECTION>').action((value) => {
    if (!isNaN(value)) {
        options.numConnections = parseInt(value);
    }
});
optParser.addOption('o', 'output', 'Specify local output file').argument('<OUTPUT>').action((value) => {
    options.output = value
});
optParser.addOption('H', 'header', 'Add header string').argument('<HEADER>').action((value) => {
    options.header.push(value)
});
optParser.addOption('v', 'verbose', 'More status information').action(() => {
    options.verbose = true
});
optParser.addOption('q', 'quiet', ' No output to stdout').action(() => {
    options.quiet = true;
});
optParser.addOption('h', 'help', 'Display this help message').action(optParser.helpAction('[options] url'));

link = optParser.parse();
if (link.length == 0) {
    optParser.helpAction('[options] url')();
}

axel.download(link[0], options).then((data) => {
    console.log(data)
    fmt.printMessage('%s download finished!', link[0]);
}).catch((error) => {
    fmt.printMessage('%', error.toString());
});