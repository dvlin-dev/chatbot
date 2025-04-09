docker build --platform linux/amd64 -t chatbot-server -f Dockerfile .

docker tag chatbot-server dvlindev/chatbot-server
docker push dvlindev/chatbot-server

docker pull dvlindev/chatbot-server
docker run -d -p 0.0.0.0:3100:3100 --name chatbot-server dvlindev/chatbot-server