'use strict';

module.exports.VERSION = '0.1.0';

module.exports.MAX_NUM_CONNECTIONS = 50;
module.exports.DEFAULT_NUM_CONNECTIONS = 2;

module.exports.CONNECTION_STATUS = {
    OPENED: 1,
    ON_PROGRESS: 2,
    DONE: 3,
    ERROR: 4
};
module.exports.MAX_REDIRECT_COUNT = 5;
module.exports.PROGRESS_BAR_LEN = 70;