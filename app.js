const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const express = require('express');
const cookieSession = require('cookie-session');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const port = process.env.PORT || 3000;
const myregion = 'us-east-1';
const mytable = 'P2Table';
const mybucket = 'p2-bucket';

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieSession({
    name: 'session',
    keys: ['key1', 'key2'],
}));

const s3 = new S3Client({ region: myregion });
const dynamodb = new DynamoDBClient({ region: myregion });

const products = [
    { 
        name: "Product 1",
        price: 10.0,
        id: "Product1.jpg"
    },
    {
        name: "Product 2",
        price: 20.0,
        id: "Product2.jpg"
    },
    {
        name: "Product 3",
        price: 30.0,
        id: "Product3.jpg"
    }
]

app.post('/add-to-cart', async (req, res) => {
    try {
        let foundProduct = products.find(product => product.id === req.body.productId);

        if (foundProduct == null) {
            res.sendStatus(404);
        }

        const item = {
            id: { S: uuidv4() },
            sessionid: { S: req.session.id },
            name: { S: foundProduct.name },
            price: { N: foundProduct.price.toString() },
            imgid: { S: foundProduct.id },
        };

        await dynamodb.send(new PutItemCommand({
            TableName: mytable,
            Item: item,
        }));

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.get('/', async (req, res) => {
    req.session.id =  req.session.id || uuidv4()
    try {
        const result = await dynamodb.send(new QueryCommand({
            TableName: mytable,
            IndexName: "sessionid-index",
            KeyConditionExpression: 'sessionid = :sessionid',
            ExpressionAttributeValues: {
                ':sessionid': { S: req.session.id },
            },
        }));

        const items = result.Items.map(item => {
            return {
                name: item.name.S,
                price: parseFloat(item.price.N),
            };
        });

        let tmpProducts = products.slice();

        for (let i = 0; i < tmpProducts.length; i++) {
            const imgParams = { Bucket: mybucket, Key: tmpProducts[i].id }
            const { Body } = await s3.send(new GetObjectCommand(imgParams));
            const chunks = [];
            for await (const chunk of Body) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const base64Image = buffer.toString('base64');
            tmpProducts[i]["image"] = `data:image/jpeg;base64,${base64Image}`;
        }

        res.status(200).render('index', { products: tmpProducts, cart: items || [] });
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.listen(port, () => console.log('Server started'));