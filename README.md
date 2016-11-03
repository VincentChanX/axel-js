#axel-js

A lightweight download accelerator. Similar to [axel](https://github.com/eribertomota/axel).axel-js tries to accelerate the downloading process by using multiple connections for one file and supports HTTP and HTTPS protocols.

#Install

```
npm install axel-js
```

#Usage

```javascript
var axel = require('axel-js');

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
```
#API

##download(url,options)

* **url**  string of the file URL to download
* **options**  object with options
    * numConnections
    * verbose
    * quiet
    * output

returns a promise object

#CLI

```
Usage:axel-js [options] url

Available Options:
-n, --num-connections <NUM-CONNECTION>
                Specify maximum number of connections
-o, --output <OUTPUT>
                Specify local output file
-H, --header <HEADER>
                Add header string
-v, --verbose   More status information
-q, --quiet      No output to stdout
-h, --help      Display this help message
```