'use strict';

var http = require('http');
var https = require('https');
var clc = require('cli-color-tty')(true);
var parseUrl = require('url').parse;
var path = require('path');
var fs = require('fs');
var extend = require('extend');
var constants = require('./constants');
var fmt = require('./fmt');
var customError = require('es5-ext/error/custom');

var noop = function() {};

var printDebugMessage = noop,
    printMessage = noop;

var options = {
    numConnections: constants.DEFAULT_NUM_CONNECTIONS,
    verbose: false,
    output: null,
    quiet: true,
    header: []
};

var url, urlInfo, requestHandler, commonRequestOptions, output,
    totalContentLength = -1,
    breakPoint = -1,
    curRedirectCount = 0,
    supportPartialContent = true;

var connectionId = 0,
    connection = {},
    connectionStatus = constants.CONNECTION_STATUS;

var startTime = null,
    endTime = null,
    downloadFinished = false;

var errorCode = {
    FILE_ALREADY_EXISTS: 1,
    PROTOCOL_NOT_SUPPORT: 2,
    BAD_REQUEST: 3
};

// download file
module.exports.download = download;

// get error code
module.exports.getErrorCode = () => {
    return copyObject(errorCode);
};

function download(u, opt) {
    url = u;
    extend(options, opt);

    // numConnections can be not greater than MAX_NUM_CONNECTIONS
    if (options.numConnections > constants.MAX_NUM_CONNECTIONS) {
        options.numConnections = constants.MAX_NUM_CONNECTIONS;
    }

    if (options.quiet === false) {
        printMessage = fmt.printMessage;
        if (options.verbose === true) {
            printDebugMessage = function() {
                printMessage.apply(this, arguments);
            };
        }
    }

    // init start time
    startTime = new Date();

    return initRequest().then(() => {
        return multiConnectionDownload();
    });
}

function initRequest() {
    return new Promise(function(resolve, reject) {
        var info = parseUrl(url),
            fileStats;

        if (urlInfo) {
            if (!info.protocol) {
                info.protocol = urlInfo.protocol;
            }
            if (!info.hostname) {
                info.hostname = urlInfo.hostname;
            }
            if (!info.port) {
                info.port = urlInfo.port;
            }
        }

        urlInfo = info;
        output = getOutput(path.basename(urlInfo.pathname));

        if (fs.existsSync(output)) {
            printMessage('output file %s is already exists', clc.red, output);
            fileStats = fs.fstatSync(fs.openSync(output, 'r'));
            if (!fileStats.isFile()) {
                throw customError('output file is already exists and it is a directory', errorCode.FILE_ALREADY_EXISTS);
            } else {
                // resume downloads
                breakPoint = fileStats.size;
                printMessage('%d bytes has been received', breakPoint);
            }
        }

        printDebugMessage('options information: %s', clc.blue, JSON.stringify(options));
        printDebugMessage('url information: %s', clc.cyan, JSON.stringify(urlInfo));
        requestHandler = getRequestHandler(urlInfo.protocol);

        printDebugMessage('initializing download: %s', clc.cyanBright, url);

        commonRequestOptions = {
            method: 'GET',
            protocol: urlInfo.protocol,
            host: urlInfo.hostname,
            path: urlInfo.path,
            headers: getHeadersFromOptions()
        };

        if (urlInfo.port) {
            commonRequestOptions.port = urlInfo.port;
        }
        return resolve();
    });
}

function multiConnectionDownload() {
    return getTotalContentLength().then((totalContentLength) => {
        var average = 0,
            numConnections = 0,
            start = 0,
            end = 0,
            i, p;

        if (options.numConnections > totalContentLength || supportPartialContent === false) {
            options.numConnections = 1;
        }
        numConnections = options.numConnections;

        if (breakPoint !== -1) {

            // download finished, have no need to download
            if (breakPoint == totalContentLength) {
                downloadFinished = true;
                endTime = new Date();
                return {
                    url: url,
                    size: totalContentLength,
                    startTime: startTime,
                    endTime: endTime
                };
            }

            start = breakPoint;
            totalContentLength -= breakPoint;
        }

        average = Math.floor(totalContentLength / numConnections);

        for (i = 1; i < numConnections; i++) {
            end = start + average - 1;
            p = downloadPartialContent(start, end, p);
            start = end + 1;
        }
        end = start + (totalContentLength - (numConnections - 1) * average) - 1;
        p = downloadPartialContent(start, end, p);

        p = p.then(() => {
            downloadFinished = true;
            endTime = new Date();
            return {
                url: url,
                size: totalContentLength,
                startTime: startTime,
                endTime: endTime
            };
        });

        if (!options.quiet) {
            setTimeout(() => {
                printProgressBar();
            }, 0);
        }

        return p;
    });
}

function getTotalContentLength() {
    return new Promise((resolve, reject) => {
        var requestOptions = copyObject(commonRequestOptions);
        addRangeHeader(requestOptions.headers, 0, 1);

        var request = requestHandler.request(requestOptions, (response) => {
            var statusCode = response.statusCode.toString(),
                headers = response.headers,
                responseContentLength = -1;

            printDebugMessage('response information:', clc.yellow);
            printDebugMessage('status code = %s, status message = %s', clc.yellow, statusCode, response.statusMessage);
            printDebugMessage('headers = %s', clc.yellow, JSON.stringify(headers));

            // check response code
            if (!statusCode.startsWith('2')) {
                if (statusCode.startsWith('3') && headers['location']) {
                    printMessage('redirect to %s', headers['location']);
                    curRedirectCount++;
                    if (curRedirectCount > constants.MAX_REDIRECT_COUNT) {
                        printMessage('too many redirects');
                        return reject(new Error('too many redirects'));
                    } else {
                        url = headers['location'];
                        initRequest().then(() => {
                            return getTotalContentLength();
                        }).then((len) => {
                            resolve(len);
                        }).catch((error) => {
                            reject(error);
                        });
                        return;
                    }
                } else if (statusCode.startsWith('4')) {
                    printMessage('resource not found', clc.red);
                    return reject(new Error('resource not found'));
                } else {
                    return reject(new Error(fmt.getMessage('status code = %s, status message = %s, download failed', statusCode, response.statusMessage)));
                }
            }

            // get total content length of downloading file
            if (headers['content-range']) {
                totalContentLength = parseContentRangeHeader(headers['content-range'])['total'];
                printDebugMessage('the content length of downloading file is %d bytes', clc.green, totalContentLength);
            } else {
                // unsupport partial content
                totalContentLength = -1;
                supportPartialContent = false;
                printDebugMessage('the server does not support partial content', clc.red);
            }
            return resolve(totalContentLength);

        });
        request.on('error', (error) => {
            printMessage('an error occurred: %s', clc.red, error.toString());
            return reject(error);
        });
        request.end();
    });
}


function downloadPartialContent(start, end, preRequestOnFinishedPromise) {
    var curConnectionId = ++connectionId;
    if (typeof start == 'undefined') {
        start = 0;
    }
    if (typeof end == 'undefined') {
        end = start + 1;
    }
    if (!preRequestOnFinishedPromise) {
        preRequestOnFinishedPromise = Promise.resolve();
    }

    var curRequestOnFinishedPromise = new Promise((resolve, reject) => {
        var requestOptions = copyObject(commonRequestOptions);
        addRangeHeader(requestOptions.headers, start, end);

        var request = requestHandler.request(requestOptions, (response) => {
            var statusCode = response.statusCode.toString(),
                headers = response.headers,
                responseContentLength = -1,
                curContentLength = 0,
                chunks = [];

            printDebugMessage('response (%02d) information:', clc.yellow, curConnectionId);
            printDebugMessage('status code = %s, status message = %s', clc.yellow, statusCode, response.statusMessage);
            printDebugMessage('headers = %s', clc.yellow, JSON.stringify(headers));

            // check response code
            if (!statusCode.startsWith('2')) {
                return reject(new Error(fmt.getMessage('status code = %s, status message = %s, download failed', statusCode, response.statusMessage)));
            }

            responseContentLength = headers['content-length'];
            connection[curConnectionId].response = response;
            connection[curConnectionId].contentLength = responseContentLength;
            connection[curConnectionId].status = connectionStatus.ON_PROGRESS;

            response.on('data', (chunk) => {
                chunks.push(chunk);
                curContentLength += chunk.byteLength;
                connection[curConnectionId].curContentLength = curContentLength;
            });

            response.on('end', () => {
                connection[curConnectionId].status = connectionStatus.DONE;
                preRequestOnFinishedPromise.then(() => {
                    var outputFd = fs.openSync(output, 'a');
                    fs.appendFileSync(outputFd, Buffer.concat(chunks));
                    fs.closeSync(outputFd);
                    chunks = null;
                    printDebugMessage('connection (%02d): data has been written to file %s', clc.green, curConnectionId, output);
                    return resolve();
                })
            });

            response.on('error', (error) => {
                printMessage('connection (%02d): an error occurred: %s', clc.red, curConnectionId, error.toString());
                connection[curConnectionId].status = connectionStatus.ERROR;
                return reject(error);
            });

            preRequestOnFinishedPromise.catch((error) => {
                chunks = null;
                return reject(error);
            });

        });

        printDebugMessage('request (%02d) information: %s', clc.magenta, curConnectionId, JSON.stringify(requestOptions));

        connection[curConnectionId] = {
            id: connectionId,
            request: request,
            status: connectionStatus.OPENED,
            start: start,
            end: end,
            contentLength: 0,
            curContentLength: 0
        };

        request.end();
    });
    return curRequestOnFinishedPromise;
}

function getRequestHandler(protocol) {
    var requestHandler = null;
    switch (protocol) {
        case 'http:':
            requestHandler = http;
            break;
        case 'https:':
            requestHandler = https;
            break;
        default:
            printMessage('only support http and https protocols', clc.red);
            throw customError('only support http and https protocols', errorCode.PROTOCOL_NOT_SUPPORT);
    }
    return requestHandler;
}

function getHeadersFromOptions() {
    var headers = {},
        i;
    if (options.header.length > 0) {
        options.header.forEach((header) => {
            i = header.indexOf(':');
            if (i === -1) {
                printMessage('header format error: %s', clc.red, header);
                throw customError('header format error', errorCode.BAD_REQUEST);
            }
            headers[header.substring(0, i)] = header.substring(i + 1);
        })
    }
    return headers;
}

function addRangeHeader(headers, start, end) {
    headers['range'] = 'bytes=' + start + '-' + end;
    return headers;
}

function parseContentRangeHeader(contentRangeHeader) {
    var tokens = contentRangeHeader.split('/');
    var start, end, total;
    total = tokens[1];
    tokens = tokens[0].split('-');
    start = tokens[0];
    end = tokens[1];
    return {
        start: start,
        end: end,
        total: total
    };
}

function getOutput(basename) {
    var output = options.output;
    if (!output) {
        options.output = output = './' + basename;
    }
    return output;
}

function getTimeUsedStr() {
    var now = new Date();
    var sec = Math.round((now.getTime() - startTime.getTime()) / 1000);
    var str = '';
    if (sec >= 3600) {
        str += parseInt(sec / 3600) + 'h';
        sec = sec % 3600;
    }
    if (sec >= 60) {
        str += parseInt(sec / 60) + 'm';
        sec = sec % 60;
    }
    if (sec >= 0) {
        str += sec + 's';
    }
    return str;
}

function getSpeedStr(curContentLength) {
    var now = new Date();
    var millisecond = now.getTime() - startTime.getTime();
    var speed = curContentLength * 1000 / millisecond;
    var str = '';
    if (speed >= 1073741824) {
        str = (Math.round(speed * 100 / 1073741824) / 100) + 'GB/s';
    } else if (speed >= 1048576) {
        str = (Math.round(speed * 100 / 1048576) / 100) + 'MB/s';
    } else if (speed >= 1024) {
        str = (Math.round(speed * 100 / 1024) / 100) + 'KB/s';
    } else {
        str = (Math.round(speed * 100) / 100) + 'B/s';
    }
    return str;
}

function getSizeStr(size) {
    var str = '';
    if (size >= 1073741824) {
        str = (Math.round(size * 100 / 1073741824) / 100) + 'GB';
    } else if (size >= 1048576) {
        str = (Math.round(size * 100 / 1048576) / 100) + 'MB';
    } else if (size >= 1024) {
        str = (Math.round(size * 100 / 1024) / 100) + 'KB';
    } else {
        str = (Math.round(size * 100) / 100) + 'B';
    }
    return str;
}

function copyObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function printProgressBar() {
    var i, conn = null,
        strs = [],
        str,
        curProgressBarLen = -1,
        totalProgressBarLen = constants.PROGRESS_BAR_LEN,
        progress, totalContentLengthOfConnection, downloadedLength = 0;

    for (i = 1; i <= options.numConnections; i++) {
        conn = connection[i];
        downloadedLength += conn.curContentLength;

        str = '';
        totalContentLengthOfConnection = conn.end - conn.start + 1;
        progress = conn.curContentLength / totalContentLengthOfConnection;

        curProgressBarLen = Math.round((progress * totalProgressBarLen));
        str += fmt.getMessage('connection(%02d) [', conn.id);
        str += '>'.repeat(curProgressBarLen);
        str += ' '.repeat(totalProgressBarLen - curProgressBarLen);
        str += fmt.getMessage('] %.2f%% of %s (%s)', parseFloat(progress * 100).toFixed(2), getSizeStr(conn.contentLength), getSpeedStr(conn.curContentLength));

        if (conn.curContentLength == totalContentLengthOfConnection) {
            strs.push(clc.green(str));
        } else if (conn.status == connectionStatus.ERROR) {
            strs.push(clc.red(str));
        } else {
            strs.push(clc.yellowBright(str));
        }
    }

    strs.unshift(fmt.getMessage('download progress: [%.2f%% of %s] [time useds:%s]', clc.green, parseFloat(downloadedLength * 100 / totalContentLength).toFixed(2), getSizeStr(totalContentLength), getTimeUsedStr(), getSpeedStr(downloadedLength)));
    strs.forEach((str) => {
        process.stdout.write(clc.erase.line);
        console.log(str);
    });

    if (!downloadFinished) {
        process.stdout.write(clc.move.up(options.numConnections + 1));
        setTimeout(() => {
            printProgressBar();
        }, 1000);
    }
}