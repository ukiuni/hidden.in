var express = require('express'),
  fs = require('fs'),
  path = require('path');
var app = express();
var port = process.env.PORT || 3000;
var options = {
  key: fs.readFileSync(process.env.KEY || './cert/private.pem'),
  cert: fs.readFileSync(process.env.CERT || './cert/cert.pem')
};
var server
if ("true" == process.env.HTTP) {
  console.log("mode http")
  server = require('http').createServer(app);
} else {
  console.log("mode https")
  server = require('https').createServer(options, app);
}
var io = require('socket.io').listen(server);
app.use(express.static('static'));
app.get("/:channel", function (request, response) {
  var filePath = path.join(__dirname, 'static/screen.html');
  var stat = fs.statSync(filePath);

  response.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Length': stat.size
  });
  var readStream = fs.createReadStream(filePath);
  readStream.pipe(response);
});
server.listen(port, function (error) {
  console.log('listening on *:' + port);
});
var store = {};
var chat = io.sockets.on('connection', function (socket) {
  socket.on('join', function (req) {
    socket.room = req.room;
    socket.join(req.room);
    io.to(socket.id).emit("joined", { id: socket.id });
    socket.broadcast.to(socket.room).json.emit("otherJoined", { id: socket.id });
  });
  socket.on('offer', function (offer) {
    socket.to(offer.targetId).emit('message', offer);
  });
  socket.on('message', function (message) {
    socket.broadcast.to(socket.room).emit('message', message);
  });
  socket.on('candidate', function (message) {
    socket.to(message.targetId).emit('message', message);
  });
  socket.on('stop', function () {
    socket.broadcast.to(socket.room).emit('otherStoped', { id: socket.id });
  });
  socket.on('disconnect', function () {
    socket.broadcast.to(socket.room).emit('otherDisconnected', { id: socket.id });
  });
});

