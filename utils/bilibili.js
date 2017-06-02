var request = require('request');

var jsonCall = function(url, cookie, callback, err){
    request({ url: url, headers: {'Cookie': cookie}, forms: arguments },
        function (error, response, body) {
            if (error || response.statusCode != 200)
            {
                if(err) err(error);
                return;
            }

            callback(JSON.parse(body));
        }
    );
};
var jsonCallPost = function(url, cookie, arguments, callback, err){
    request.post({ url: url, headers: {'Cookie': cookie}, form: arguments },
        function (error, response, body) {
            if (error || response.statusCode != 200)
            {
                if(err) err(error);
                return;
            }

            callback(JSON.parse(body));
        }
    );
};
exports.jsonCallPost=jsonCallPost;

exports.fetch_blacklist = function(cookie, callback){
    jsonCall('https://api.bilibili.com/x/dm/filter/user?jsonp=jsonp', cookie,
        function(res){
            result=res["data"]
            if(result==undefined) callback(false, res);
            else callback(true, result["rule"]);
        },
        function(err){
            callback(false, err);
        }
    );
};
