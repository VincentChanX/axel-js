var axel = require('../lib/axel');

axel.download('http://nginx.org/download/nginx-1.11.5.tar.gz', {
    output: './nginx.tar.gz',
    quiet: false,
    verbose: false,
    numConnections: 3,
    header: []
}).then((data) => {
    //download finished
    console.log(data.url);
    console.log(data.size);
    console.log(data.startTime);
    console.log(data.endTime);
}).catch((error) => {
    //an error occurred
});