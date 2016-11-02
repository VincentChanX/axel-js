'use strict';

var clc = require('cli-color-tty')(true);
var vsprintf = require('sprintf-js').vsprintf;
var sprintf = require('sprintf-js').sprintf;


module.exports.printMessage = function(format, colorFunc, args) {
    process.stdout.write(clc.erase.line);
    console.log(getMessageStr.apply(this, arguments));
};

module.exports.getMessage = function(format, colorFunc, args) {
    return getMessageStr.apply(this, arguments);
};

function getMessageStr(format, colorFunc, args) {
    var format = arguments[0] ? arguments[0] : '';
    var args = [],
        i;
    if (typeof colorFunc !== 'function') {
        for (i = 1; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return vsprintf.call(this, format, args);
    } else {
        for (i = 2; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return colorFunc(vsprintf.call(this, format, args));
    }
}