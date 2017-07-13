import request = require('request');

type JSONCallback = ((result: any) => void) | null;
type ErrorCallback = ((error: any) => void) | null;
type APICallback = ((isSuccess: boolean, resultOrError: any)=>void) | null;

enum FilterType {
    Normal, Regex, User
}

/**
 * send a request, expecting a JSON object.
 * 
 * @param {string} url
 * @param {null|string} cookie
 * @param {JSONCallback} callback
 * @param {ErrorCallback} err
 */
export function jsonCall(url: string, cookie: null|string, callback: JSONCallback, err: ErrorCallback) {
    request.get({ url: url, headers: { 'Cookie': cookie } },
        function (error, response, body) {
            if (error || response.statusCode != 200) {
                if (err) err(error);
            } else if (callback) callback(JSON.parse(body));
        }
    );
};
/**
 * send a post request with arguments, expecting a JSON object.
 * 
 * @param {string} url
 * @param {null|string} cookie
 * @param {object} args arguments
 * @param {JSONCallback} callback
 * @param {ErrorCallback} err
 */
export function jsonCallPost(url: string, cookie: null|string, args: object, callback: JSONCallback, err: ErrorCallback) {
    request.post({ url: url, headers: { 'Cookie': cookie }, form: args },
        function (error, response, body) {
            if (error || response.statusCode != 200) {
                if (err) err(error);
            } else if(callback) callback(JSON.parse(body));
        }
    );
};

/**
 * Add a filter by sending reqeust to bilibili server.
 * 
 * @export
 * @param {string} cookie bilibili cookies
 * @param {FilterType} type the type of the filter
 * @param {string} filter the content of the filter
 * @param {APICallback} callback the callback for the results
 */
export function addFilter(cookie: string, type: number, filter: FilterType, callback: APICallback) {
    jsonCallPost('https://api.bilibili.com/x/dm/filter/user/add', cookie,
        { "type": type, "filter": filter, "jsonp": "jsonp", "csrf": "" },
        function (res) {
            if (callback) callback(true, res);
        },
        function (err) {
            if (callback) callback(false, err);
        }
    );
}

/**
 * Fetch all filters from bilibili server.
 * 
 * @export
 * @param {string} cookie bilibili cookies
 * @param {APICallback} callback the callback for the results
 */
export function fetchBlacklist(cookie: string, callback: APICallback) {
    jsonCall('https://api.bilibili.com/x/dm/filter/user?jsonp=jsonp', cookie,
        function (res) {
            if (callback==null) return
            let result = res["data"]
            if (result == undefined) callback(false, res);
            else callback(true, result["rule"]);
        },
        function (err) {
            if(callback) callback(false, err);
        }
    );
};
