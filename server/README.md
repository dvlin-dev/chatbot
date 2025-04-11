docker build --platform linux/amd64 -t chatbot-server -f Dockerfile .

docker tag chatbot-server dvlindev/chatbot-server
docker push dvlindev/chatbot-server

docker pull dvlindev/chatbot-server
docker run -d -p 0.0.0.0:3101:13000 -e OPENAI_TYPE=OPENAI -e OPENAI_API_MODEL=grok-3-fast-latest  -e OPENAI_API_KEY=key  -e OPENAI_BASE_URL=url --name chatbot-server dvlindev/chatbot-server

docker run --env-file ./.env dvlindev/chatbot-server
