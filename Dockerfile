FROM mhart/alpine-node

COPY . /
EXPOSE  3000

CMD ["node", "/index.js"]
