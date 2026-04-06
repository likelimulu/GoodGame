# GoodGame — Docker build & push helpers
# Usage:
#   make build           build the production Django image
#   make push            push the image to Azure Container Registry
#   make build-push      build + push in one step
#   make deploy          trigger a new Container Apps revision
#
# Prerequisites:
#   export ACR_NAME=<registry-name>   (from terraform output container_registry_login_server)
#   az acr login --name $$ACR_NAME    or set ACR_USERNAME / ACR_PASSWORD for non-interactive

ACR_NAME ?= goodgameregistry
IMAGE_NAME = goodgame-api
TAG ?= latest
FULL_IMAGE = $(ACR_NAME).azurecr.io/$(IMAGE_NAME):$(TAG)

RESOURCE_GROUP ?= goodgame-rg
CONTAINER_APP ?= goodgame-api

.PHONY: build push build-push deploy

build:
	docker buildx build \
	  --platform linux/amd64 \
	  -f docker/Dockerfile.django.prod \
	  -t $(FULL_IMAGE) \
	  .

push:
	az acr login --name $(ACR_NAME)
	docker push $(FULL_IMAGE)

build-push: build push

deploy:
	az containerapp update \
	  --name $(CONTAINER_APP) \
	  --resource-group $(RESOURCE_GROUP) \
	  --image $(FULL_IMAGE)
