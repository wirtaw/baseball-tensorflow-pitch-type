# Dockerfile
# The FROM directive sets the Base Image for subsequent instructions
FROM docker.io/nikolaik/python-nodejs:python3.7-nodejs12

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh
# Set environment variables
ENV appDir /var/www/app/baseball-tensorflow-app

# ...
# Run updates and install deps
RUN apt-get update

RUN mkdir -p /var/www/app/baseball-tensorflow-app
WORKDIR ${appDir}

# Install npm *globally* so we can run our application
RUN npm i -g npm
# Add our package.json and install *before* adding our application files
ADD package.json ./
RUN npm i --production

# Add application files
ADD . /var/www/app/baseball-tensorflow-app

RUN cp .env.docker .env

RUN echo 'PATH_DATA_FILES=/var/www/app/baseball-tensorflow-app/src' >> /var/www/app/baseball-tensorflow-app/.env

#Expose the port
EXPOSE 3000 1234

CMD ["start", "--no-daemon"]
