import http.server
import ssl

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/public" or self.path == "/public/":
            self.path = "/public/index.html"
        super().do_GET()

server_address = ("0.0.0.0", 443)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain("localhost.pem")
httpd = http.server.HTTPServer(server_address, Handler)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
print("running server")
httpd.serve_forever()
