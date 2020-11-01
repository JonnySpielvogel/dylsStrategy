// overwrite console.log so it logs to a file and to the console
const log           = require('log-to-file')
const ogLog = console.log;
console.log = function() {
  for (const arg of arguments) {
    log(arg)
    ogLog(arg)
  }
}
// end overwrite of console.log
const Alpaca 		= require('@alpacahq/alpaca-trade-api')
const API_KEY 		= process.env.ALPACA_API_KEY;
const API_SECRET 	= process.env.ALPACA_SECRET_KEY;
const USE_POLYGON 	= false;  // by default we use the Alpaca data stream but you can change that
const alpaca 		= new Alpaca({
  						keyId: API_KEY,
  						secretKey: API_SECRET,
  						paper: true,
  						usePolygon: USE_POLYGON
					})
const finnhub = require('finnhub')
const api_key = finnhub.ApiClient.instance.authentications['api_key'];
api_key.apiKey = process.env.FINNHUB_API_KEY; 
const finnhubClient = new finnhub.DefaultApi()
const moment = require('moment')
const movingAverages = require('moving-averages')
const chalk = require('chalk')





//datasets
const stocks = require('symbols')

//initializing required variables
let account = { openPositions: [], openOrders: [] }; // Contains cash, buying power, open orders and open positions, buying power takes into account open orders and not sure yet but possibly margin
let portfolioValueArr = []; //*** How do I access the value from this variable from previous executions without a db set up
let signals = []; // Objects that have successfully passed the strategy "buy to open"
let signalsSell = [];// Objects that have successfully passed the strategy "sell to close" and same orders do not exist
let buyToOpenArr = []; // Objects that have successfully passed the strategy "buy to open" and same current positions do not exist
let executeOpenArr = []; // Execute Open array of objects with key name information to place an alpaca order
let openPositionsArr = []; // Currently held positions in the alpaca account
let sellToCloseArr = []; // Create an array from alpaca of held positions that need to pass sell to close strategy
let executeCloseArr = []; // Sell to Close array of object with key name information to place an alpaca order
/* Moved outside of partOne so partTwo can access them - Ian */
let ownedSymbols = []; // Array of strings for alpaca bars function
const start = moment().format('yyyy-mm-ddThh:MM:ss-04:00');
const end = moment().subtract(1, 'days').format('yyyy-mm-ddThh:MM:ss-04:00');
// end moved outside of partOne...


// alpaca.cancelAllOrders() // Use when you want to clear the open orders, for testing in this position 

async function dylsworth() {
    partOne()
}

async function partOne() {
    console.log(chalk.yellow('Running partOne...'))
    try {
        console.log(start, end)
        let response = await alpaca.getBars('15Min', stocks, {start, end})// Gets candlestick data and stores json
        let accountDetail = await alpaca.getAccount() //current account detail for the apikey and secret account
        console.log(accountDetail)
        let accountPositions = await alpaca.getPositions()//Gets current positions in account returns json
        let accountOrders = await alpaca.getOrders({status: 'open', direction: 'desc'})//Gets all open orders returns json
        let cashData = parseFloat(accountDetail.cash)//Stores a number value
        account.cash = cashData //pushes the cash in account to the account object
        let portfolioValueCurrent = accountDetail.portfolio_value; //stores the portfolio value
        //Commented out becuase we will use a db to store account
        //This will check what the starting portfolio value is and compare to the current value
        // Still unsure how to plan the proper selling strategy 
        // if(portfolioValueStart = "start") { 
        //     portfolioValueStart = parseFloat(portfolioValueCurrent)
        // }
        account.portfolioValue = accountDetail.portfolio_value //Push the current potfolio value to the account object
        let buyingPowerData = parseFloat(accountDetail.buying_power) //stores a number value
        account.buyingPower = buyingPowerData //pushes the buying power to the account object (possibly unnecessary to save this value only doing so to review account balance and check for errors)
        account.regtBuyingPower = accountDetail.regt_buying_power //pushes regulation t buying power the account object
        for(const accountPosition of accountPositions) { //takes json from the accountPostions array returned from alpaca which are current owned positions
            
                let open = {
                    asset_id: accountPosition.asset_id, //stores asset id
                    symbol: accountPosition.symbol, // stores symbol
                    qty: accountPosition.qty, //stores owned qty
                    entryPrice: accountPosition.avg_entry_price, //stores the price purchased for
                    orderSide: accountPosition.side //stores 'long'
                }
                account.openPositions.push(open)
        }
        //I want this to check if the portfolio has lost 2% or less or 5% or more and sell all, cancel all, and kill program
        //This will not work until we build a db, and still unsure of sale strategy
        // if(((portfolioValueCurrent - portfolioValueStart)/portfolioValueStart) <= -.02 || ((portfolioValueCurrent - portfolioValueStart)/portfolioValueStart) >= .05 ){
        //     alpaca.cancelAllOrders();
        //     for(const holding of accountPositions) {
        //         let sellNow = {
        //             symbol: holding.symbol,
        //             qty: holding.qty,
        //             side: 'sell',
        //             type: 'market',
        //             time_in_force: 'day',
        //         }
        //         alpaca.createOrder(sellNow); // Note from Ian, this may not fully run before process exits, need to test.
        //     }
        //     process.exit()
        // }
        for(const accountOrder of accountOrders) { //Data Build for current open orders
            if(accountOrder.status === 'new' || accountOrder.status === 'accepted'){ //Status of 'new' identifies a sell, 'accepted' identifies a buy
                let open = {
                    id: accountOrder.id,// order id #
                    symbol: accountOrder.symbol, // symbol
                    qty: accountOrder.qty, //order qty
                    orderSide: accountOrder.side, // buy or sell
                    orderType: accountOrder.order_type, // day order
                    limitPrice: accountOrder.limit_price, // limit price
                    stopPrice: accountOrder.stop_price,  // stop price
                    status: accountOrder.status // accepted or new
                    
                }
                
                account.openOrders.push(open) //pushes the object to account object open orders array
            }    
        }

        let { buyingPower, cash } = account //I dont know exactly what this does
        console.log(chalk.yellow('Current Portfolio Value: ' + chalk.green(account.portfolioValue)))
        console.log(chalk.yellow(`Current Cash Holdings: ${ cash > 0 ? chalk.green(cash) : chalk.red(cash) }`))
        console.log(chalk.yellow(`Current Buying Power: ${ buyingPower > 0 ? chalk.green(buyingPower) : chalk.red(buyingPower) }`))
        
        let keys = Object.keys(response) //This stores the candlestick values and associated symbols in json from alpaca and its searching the array from symbols.js
        let intervals = 20 // needs to be based on user input with UI or CLI
        let spliceVal = keys.length - intervals //when intervals is dynamic this will allow to create different intervals for EMA 
        for (const key of keys) {
            let lastN = response[key].splice(spliceVal) //splices the amount of bars to 20 intervals currently
            let total = 0 //now unnecessary as we are using the moving averages package, talk to ian and delete
            let closingPrices = [] //closing prices of stock array, talk to ian if needed to save
            let openingPrices = [] //opening prices of stock array, talk to ian if needed to save
            let directions = [] //candlestick up or down
            let highPrices = [] // high prices of stock array
            
            lastN.forEach((stock, i) => { //for each key with 20 intervals
                total += stock.closePrice //possibly unnecessary review with ian and delete
                highPrices.push(stock.highPrice) //storing the stocks high prices
                closingPrices.push(stock.closePrice) //May not need to save this data
                openingPrices.push(stock.openPrice) //May not need to save this data
                if(stock.closePrice < stock.openPrice) { //checking direction of candlestick
                    directions.push('down') //if down
                } else if(stock.closePrice > stock.openPrice) {
                    directions.push('up') //if up
                } else {
                    directions.push('even') //if flat ie $4.00 close, $4.00 open
                }
            })
            let simpleMovingAvgStart = await movingAverages.ma(closingPrices, intervals) //this gets the simple moving average over a 20 interval period 
            let simpleMovingAvg = simpleMovingAvgStart[simpleMovingAvgStart.length - 1] //stores the end of the array value, which is the current simple moving average 
            let lastTrade = await alpaca.lastTrade(key) //stores the current price of the stock
            let lastTradePrice = lastTrade.last.price //last trade is an object, with nested object that stores info about the last trade of the stock which is the most current price
            let exponentialMovingStart = await movingAverages.ema(closingPrices, intervals) // gets exponential moving average
            let exponentialMovingAvg = exponentialMovingStart[exponentialMovingStart.length - 1] // stores the last value of the array which is the current EMA
            let stockData = { //data build for strategy review
                symbol: key,
                highPrices,
                openingPrices,
                closingPrices,
                directions,
                simpleMovingAvg,
                lastTradePrice,
                exponentialMovingAvg
            }
            let isGreater = false // this is if 2 bars greater and their direction is up
            let amountOfBars = 0; //counts how many bars are matching the strategy
            for (let i = 0; i < highPrices.length; i++) { //iterates the high prices array of the stock
                
                if(highPrices[i] > exponentialMovingAvg && directions[i] == 'up') { //high price is greater than ema and those candlesticks are in the up direction
                    console.log(key + " || " + directions[i] + " || " + highPrices[i] + " || " + exponentialMovingAvg)
                    amountOfBars++ //add a bar
                    
                }
                if(amountOfBars >= 2) {
                    isGreater = true //passed strategy if two bars are higher than ema and their direction is up
                    break //stops iterating as strategy is met
                    
                }
            }
    
            if (exponentialMovingAvg > simpleMovingAvg && isGreater) { //completes the strategy, if passed its pushed into butToOpenArr array if fail is logged
                signals.push(stockData) //pushes the stock which is now signalled to purchase
                console.log(chalk.green(stockData.symbol + ' || Buy Match'));
                console.log("===========================================")
                console.log("===========================================")
            } else {
                console.log(chalk.red(stockData.symbol + ' || No Match'))
                console.log("===========================================")
                console.log("===========================================")
            }
        }
        
       
        //Check if signaled position is in account and remove from signals array if so
        // console.log('open', account.openPositions)
        let removeSignals = ['A'] // not sure if the A hurts this
        for (const signal of signals) { //checking a single signal
            for (const position of account.openPositions) { // from line 203 against what we currently own in the account
                if (signal.symbol === position.symbol) { //if the signal and position are equal we alert the user
                    console.log(signal.symbol + " Already in Account")
                    removeSignals.push(signal) //add the signal to the remove signals array which is used to remove the signals which are already owned positions
                }
            }
        }
        signals = signals.filter(signal => { //creating a new array from signals that are not open positions
            if (!removeSignals.includes(signal)) { // this falsifies the already owned signals
                return signal // this stores the signals not already owned in the array "signals"
            }
        })
        
        //Establish Quantity
        let totalOrderValue = 0; //totals the current order values... meaning qty*limit price
        let purchaseValue = account.cash/signals.length; //Available cash in the account with open orders taken into account
        console.log("Starting Purchase Value: " + purchaseValue * signals.length)
        
        if (account.openOrders.length > 0) { //add the total order values (qty * price), this if statement is prevalent to line 231 and the purchase value if there are open orders 
            for (const order of account.openOrders) { //looping all open orders
                if (order.orderSide === 'buy') { // if the order is a buy then
                    orderValue = parseFloat(order.limitPrice) // turning the price string into a number
                    totalOrderValue += (orderValue * order.qty) // sums the total value of this order
                }
            }
            console.log(account.cash) //amount of cash available
            console.log(totalOrderValue) // amount of cash needed for current open orders
            purchaseValue = (account.cash - totalOrderValue)/signals.length // should be "cash" if open orders array is empty, if not it will subtract the open orders
        }
        console.log("Adjusted Purchase Value: " + purchaseValue * signals.length) //I use this to check if the value is negative, for indication of next step
        if (purchaseValue > 0) { // if negative this should not execute
            for (const buyToOpen of signals) { //looping signals to create an object that alpaca can handle
                let initialQty = (purchaseValue/buyToOpen.lastTradePrice) //purchase value is divided by the total number of filtered symbols and used here to get a qty by dividing it by the current market price
                let qty = parseInt(initialQty) //turning qty to a number from a string and making it a whole number
                let buyToOpenData = { // creating the necessary data for alpaca
                    symbol: buyToOpen.symbol, //symbol
                    qty: qty, // qty
                    side: 'buy', // purchase it
                    type: 'limit', // specific limit price
                    time_in_force: 'day', //day order
                    limit_price: buyToOpen.lastTradePrice //limit price = the current market price 
                }
                executeOpenArr.push(buyToOpenData) //pushing to a new array 
            }
            console.log('Execute Open Arr', executeOpenArr) //reviewing all positions in the execute open arr, this isnt working properly though
            for (const executeOpen of executeOpenArr) { // looping the array
                if (executeOpen.qty > 0) { // making sure to not get an error if there is 0 or less qty  
                    alpaca.createOrder(executeOpen) // this creates the order for alpaca to execute
                }  
            }
        } else { // if cash and current open orders is < 0 this saves us from throwing an error
            console.log("Not Enough Cash To Purchase at This Time")
        }
        let currentOpenPositions = await alpaca.getPositions() // getting open positions after order executions, makes me think we may want this to execute about 5 seconds after all orders are placed, which will mean we need the following functions until part two to wait as well
        for (const currentOpenPostion of currentOpenPositions) { // looping the open positions
            let result = currentOpenPostion.symbol // setting result to the symbol
            ownedSymbols.push(result) // creating a new array with strings for alpaca get bars to handle 
            let openPositionsData = { //creating an object to use for analyzing sell strategy
                symbol: currentOpenPostion.symbol, // symbol
                qty: currentOpenPostion.qty, // qty
                entryPrice: currentOpenPostion.avg_entry_price, //entry price
                side: currentOpenPostion.side // side long or short
            }
            openPositionsArr.push(openPositionsData) //pushing the object to an array
        }
        if (ownedSymbols.length) partTwo() // this only occurs if there are positions owned
    } catch(err) {
        console.log(chalk.red('ERROR:'), err.message)
    }
}

async function partTwo() {
    console.log(chalk.yellow('Running partTwo...'))
    try {
        let response = await alpaca.getBars('5Min', ownedSymbols, {start, end}) //getting candlstick data
        let keys = Object.keys(response) // setting keys as an array of objects
        let intervals = 20 // needs to be based on user input with UI or CLI
        let spliceVal = keys.length - intervals //not currently using
        for (const key of keys) { // looping the object
            let lastN = response[key].splice(80) // The total amount of bars in the array should be 20, I think this works
            let total = 0 //unecessary as we are using the moving averages package
            let closingPrices = [] // array of 20 closing prices
            let openingPrices = [] // array of 20 opening prices
            let directions = [] // array of candlstick directions up or down
            let lowPrices = [] // array of 20 low prices

            lastN.forEach((stock, i) => { // looping the candlstick arrays
                total += stock.closePrice // likely unecessary
                lowPrices.push(stock.lowPrice) //low price push
                closingPrices.push(stock.closePrice) //May not need to save this data
                openingPrices.push(stock.openPrice) //May not need to save this data
                if (stock.closePrice < stock.openPrice) { //configuring if candlestick was down
                    directions.push('down') //pushing down
                } else if (stock.closePrice > stock.openPrice) { // configuring if candlestick was up
                    directions.push('up') // pushing up
                } else { // if candlestick was flat
                    directions.push('even')  // pushing even, could also be flat or anything other than up or down
                }
            })
            let simpleMovingAvgStart = await movingAverages.ma(closingPrices, intervals) // creates an array of moving averages
            let simpleMovingAvg = simpleMovingAvgStart[simpleMovingAvgStart.length - 1] // seperates the current SMA
            let lastTrade = await alpaca.lastTrade(key) //gets the current stock price
            let lastTradePrice = lastTrade.last.price // stores the current stock price from the object returned
            let exponentialMovingStart = await movingAverages.ema(closingPrices, intervals) // creates an array of Expo moving averages
            let exponentialMovingAvg = exponentialMovingStart[exponentialMovingStart.length - 1] //seperates the current EMA
            let stockData = {//Creates an object to use for reviewing the sell strategy
                symbol: key,
                lowPrices,
                openingPrices,
                closingPrices,
                directions,
                simpleMovingAvg,
                lastTradePrice,
                exponentialMovingAvg
            }
            let isLess = false // this is if 2 bars greater and their direction is up
            let amountOfBars = 0 // sum of total bars indicated
            for (let i = 0; i < lowPrices.length; i++) { // loops the low prices array
                
                if (lowPrices[i] < exponentialMovingAvg && directions[i] == 'down') { //if the low price is less than the current EMA and the direction is down move on
                    console.log(key + " || " + directions[i] + " || " + lowPrices[i] + " || " + exponentialMovingAvg)
                    amountOfBars++ // add a bar
                }
                if (amountOfBars >= 2) { // when two bars meet the criteria execute
                    isLess = true // is less can now pass
                    break    // stop the loop when two bars are hit
                }
            }
            if (exponentialMovingAvg < simpleMovingAvg && isLess) { //completes the strategy, if passed its pushed into butToOpenArr array if fail is logged
                signalsSell.push(stockData) // pushes the sell signal
                console.log(chalk.green(stockData.symbol + ' || Sell Match'))
                console.log("===========================================")
                console.log("===========================================")
            } else {
                console.log(chalk.red(stockData.symbol + ' || No Match'))
                console.log("===========================================")
                console.log("===========================================")
            }   
        }

        //Check if signaled position is in account and remove from signals array if so
        //This needs to be tested to see if it will work
        let removeSignals = [] // removed signals array for signals that we already have an order for
        for (const signal of signalsSell) { //reviews signals against open orders
            for (const order of account.openOrders) { // compares open orders to signals to sell
                if (signal.symbol == order.symbol) { // if they are the same
                    console.log(signal.symbol + " Order already in Place") // alert the user we already have an order
                    removeSignals.push(signal) // push this signal to the removed signals array
                }
            }
        }
        signalsSell = signalsSell.filter(signalSell => { // filters the signals sell array
            if (!removeSignals.includes(signalSell)) { //falsifies when the open order and signall are the same
                return signalSell // builds the array with signals that are not open orders
            }
        })

        for (const signal of signalsSell) { //you need to add limit or stop to type (depending if the last trade price is higher or lower than the entry)
            for (const openPosition of openPositionsArr) { // comparing the open position to the open signal
                if (signal.symbol === openPosition.symbol) { // if the open position and signal are the same
                    let stopOrderPrice = signal.lowPrices[0] //create the stop order price, but not currently sure what that should be so this is a placeholder
                    for (const price of signal.lowPrices) { // reviewing all low prices for the signal
                        if (price < stopOrderPrice) { // reviewing all low prices and comparing to the stop order price
                            stopOrderPrice = price // this should make the stop order price the lowest low price from the candlestick data
                        }
                    }
                    let limitPrice = parseFloat(((signal.lastTradePrice - stopOrderPrice)*3) + signal.lastTradePrice) //this is taking the current price subtracting the stop price so think stock 100 current 99 stop= 1 * 3 | 3 + 100(current price) and turning it into a number from a string
                    let sellData = { // building the sell object to pass to alpaca 
                        symbol: signal.symbol, //symbol
                        qty: openPosition.qty.toString(), //current qty
                        side: 'sell', //sell this
                        type: 'stop_limit', //stop limit price
                        time_in_force: 'day', // day order
                        stop_price: stopOrderPrice.toString(), //stop price order
                        limit_price: limitPrice.toString(), //review line 370, we can probably take out the parseFloat and the toString here
                      }
                    executeCloseArr.push(sellData) // pushing to the execute close array
                }
            }
        }
        console.log('Open orders:') // review all open orders in the terminal
        for (const order of account.openOrders) {
            console.log(order.symbol) //each symbol displayed
        }
        console.log(executeCloseArr)
        for (const executeClose of executeCloseArr) {
            alpaca.createOrder(executeClose) // this creates the order for alpaca to execute
            console.log(chalk.red('Order Placed For: ' + executeClose.symbol))
            console.log(chalk.red('Day Order Stop Price: ' + executeClose.stop_price))
            console.log(chalk.red('Day Order Limit Price: ' + executeClose.limit_price))
            console.log(chalk.red("==========================================="))
            console.log(chalk.red("==========================================="))
        }
    } catch(err) {
        console.log(chalk.red('ERROR:'), err.message)
    }
}

module.exports = dylsworth;

process.on( 'SIGINT', function() {
    console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" )
    // some other closing procedures go here
    process.exit()
})