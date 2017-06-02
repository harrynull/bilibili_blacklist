exports.jsonCall = function(url, cookie, callback, err){
    request({ url: url, headers: {'Cookie': cookie} },
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

exports.fetch_blacklist = function(cookie, callback){
    bilibili.jsonCall('https://api.bilibili.com/x/dm/filter/user?jsonp=jsonp', cookie,
        function(res) {
            result=res["data"]
            if(result==undefined) callback(false, res);
            else callback(true, result["rule"]);
        },
        function(err){
            callback(false, err);
        }
    );

};
