var express = require('express');
var app = express();

app.use('/', express.static(__dirname + '/www'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));

app.post('/login/cookies', function (req, res) {
   res.cookie("DedeUserID", req.params.DedeUserID);
   res.cookie("DedeUserID__ckMd5", req.params.DedeUserID__ckMd5);
   res.cookie("SESSDATA", req.params.SESSDATA);
   res.redirect("/");
})

var server = app.listen(8000)
