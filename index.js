const end = (arr) => arr[arr.length - 1];
const delay = ms => new Promise(res => setTimeout(res, ms));
const sha256 = async (state) => {
    const msg = new TextEncoder('utf-8').encode(JSON.stringify(state));
    const buf = await window.crypto.subtle.digest('SHA-256', msg);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => ('00' + b.toString(16)).slice(-2)).join('');
};

const Card = {
    SUIT_CLASSNAMES: ['s', 'h', 'c', 'd'],
    SUIT_NAMES: ['spades', 'hearts', 'clubs', 'diamonds'],
    RANK_NAMES: ['', 'ace', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'jack', 'queen', 'king'],
    toClassName: (i) => `${Card.SUIT_CLASSNAMES[(i >> 4) & 3]}${(i & 15)}`,
    toString: (i) => `${Card.RANK_NAMES[i & 15]} of ${Card.SUIT_NAMES[(i >> 4) & 3]}`,
    render: (c) => [
        '<li class="',
        ...([
            'card',
            Card.toClassName(c),
            !(c & 64) ? 'facedown' : undefined
        ].filter(i => !!i).join(' ')),
        `">${Card.toString(c)}</li>`].join(''),
    getRank: (i) => i & 15,
    getSuit: (i) => (i >> 4) & 3,
    isRed: (i) => !!(i & 16),
    areOpposite: (i, j) => ((i & 16) ^ (j & 16)),
    isFaceUp: (i) => !!(i & 64),
};
const Solitaire = {
    isSearching: false,
    isWinnable: false,
    MAX_MOVES: 50000,
    movesMade: 0,
    visitedStateHashes: [],
    renderedState: null,

    init: () => {
        let deck = [], shuffled = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 1; j <= 13; j++) {
                deck.push(i << 4 | j);
            }
        }
        do {
            shuffled.push(deck.splice(0 | (Math.random() * deck.length), 1)[0]);
        } while (deck.length > 0);

        const state = {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableaus: [[], [], [], [], [], [], []],
        };
        state.tableaus.forEach((tb, idx) => {
            for (let i = 0; i <= idx; i++) {
                state.tableaus[idx].push(shuffled.pop());
            }
            // Face-up the last card
            state.tableaus[idx][state.tableaus[idx].length - 1] |= 64;
        });
        state.stock = [...shuffled];
        Solitaire.isSearching = true;
        requestAnimationFrame(() => {
            Solitaire.next(state);
            Solitaire.render(state);
        });
    },
    render: (state, depth = 0) => {
        Solitaire.renderedState = state;
        const topBar = document.getElementById('top-bar');
        topBar.innerHTML = [
            'Tried: ' + Solitaire.movesMade,
            'Depth: ' + depth,
            'Running: ' + (Solitaire.isSearching ? 'yes' : 'no'),
            'Winnable: ' + (Solitaire.isWinnable ? 'yes' : 'no'),
        ].join('; ');

        const field = document.getElementById('field');
        field.innerHTML = [
            '<ul id="stock">',
            (state.stock.length > 0
                ? Card.render(end(state.stock))
                : '<li class="card empty"></li>'),
            '</ul>',
            '<ul id="waste">',
            (state.waste.length > 0
                ? Card.render(end(state.waste))
                : '<li class="card empty"></li>'),
            '</ul>',
            '<ul id="foundations">',
            ...(state.foundations.map((fnd) => fnd.length > 0
                ? Card.render(end(fnd))
                : '<li class="card empty"></li>'
            )),
            '</ul>',
            '<ul id="tableaus">',                    
            ...(state.tableaus.map((tb, idx) => [
                `<li id="tableau-${idx}">`,
                '<ol>',
                ...(tb.map((c) => Card.render(c))),
                '</ol>',
                '</li>',
            ].join(''))),
            '</ul>',
        ].join('');
    },
    moves: [
        // Waste onto foundation
        (stateJson) => {
            const nextStates = [];
            const state = JSON.parse(stateJson);
            if (state.waste.length > 0) {
                const wasteEnd = end(state.waste);
                const wasteEndFnd = state.foundations[Card.getSuit(wasteEnd)];
                if ((
                    Card.getRank(wasteEnd) === 1 &&
                    wasteEndFnd.length === 0
                ) || (
                    wasteEndFnd.length > 0 &&
                    Card.getRank(end(wasteEndFnd)) === Card.getRank(wasteEnd) - 1
                )) {
                    state.foundations[Card.getSuit(wasteEnd)].push(state.waste.pop());
                    state.moveType = 'WASTE-TO-FND';
                    nextStates.push(state);
                }
            }
            return nextStates;
        },
        // Top of a tableau onto foundation
        (stateJson) => {
            const nextStates = [];
            for (let i = 0; i < 7; i++) {
                const state = JSON.parse(stateJson);
                if (state.tableaus[i].length > 0) {
                    const tableauEnd = end(state.tableaus[i]);
                    const tableauEndFnd = state.foundations[Card.getSuit(tableauEnd)];
                    if ((Card.getRank(tableauEnd) === 1 && tableauEndFnd.length === 0) || (
                        tableauEndFnd.length > 0 &&
                        Card.getRank(end(tableauEndFnd)) === Card.getRank(tableauEnd) - 1
                    )) {
                        state.foundations[Card.getSuit(tableauEnd)].push(state.tableaus[i].pop());
                        state.tableaus[i][state.tableaus[i].length - 1] |= 64;
                        state.moveType = 'TABLEAU-TO-FND';
                        nextStates.push(state);
                    }
                }
            }
            return nextStates;
        },
        // King-stack to an empty tableau
        (stateJson) => {
            const nextStates = [];
            for (let i = 0; i < 7; i++) {
                const state = JSON.parse(stateJson);
                if (state.tableaus[i].length > 1) {
                    if (
                        !Card.isFaceUp(Card.getRank(state.tableaus[i][0])) &&
                        Card.getRank(state.tableaus[i].filter(c => c & 64)[0]) === 13
                    ) {
                        for (let j = 0; j < 7; j++) {
                            if (state.tableaus[j].length === 0) {
                                while (end(state.tableaus[i]) & 64) {
                                    state.tableaus[j].push(state.tableaus[i].pop());
                                }
                                state.tableaus[i][state.tableaus[i].length - 1] |= 64;
                                state.tableaus[j].reverse();
                                state.moveType = 'MOVE-KING-STACK';
                                nextStates.push(state);
                                break;
                            }
                        }
                    }
                }
            }
            return nextStates;
        },
        // Non-king stack to an eligible tableau
        (stateJson) => {
            const nextStates = [];
            const parsed = JSON.parse(stateJson);
            for (let i = 0; i < 7; i++) {
                if (parsed.tableaus[i].filter(c => c & 64).length > 0) {
                    for (let c = parsed.tableaus[i].length - 1; c >= 0; c--) {
                        if (Card.isFaceUp(parsed.tableaus[i][c])) {
                            for (let j = 0; j < 7; j++) {
                                const state = JSON.parse(stateJson);
                                if (i != j &&
                                    state.tableaus[j].length > 0 &&
                                    Card.getRank(state.tableaus[i][c]) ===
                                    Card.getRank(end(state.tableaus[j])) - 1 &&
                                    Card.areOpposite(
                                        state.tableaus[i][c],
                                        end(state.tableaus[j])
                                    )
                                ) {
                                    const stack = [];
                                    for (let k = state.tableaus[i].length; k > c; k--) {
                                        stack.push(state.tableaus[i].pop());
                                    }
                                    stack.reverse();
                                    state.tableaus[j] = state.tableaus[j].concat(stack);
                                    state.tableaus[i][state.tableaus[i].length - 1] |= 64;
                                    state.moveType = 'MOVE-STACK';
                                    nextStates.push(state);
                                }
                            }
                        }
                    }
                }
            }
            return nextStates;
        },
        // King waste to an empty tableau
        (stateJson) => {
            const nextStates = [];
            const state = JSON.parse(stateJson);
            if (state.waste.length > 0 && Card.getRank(end(state.waste)) === 13) {
                for (let i = 0; i < 7; i++) {
                    if (state.tableaus[i].length === 0) {
                        state.tableaus[i].push(state.waste.pop());
                        state.moveType = 'KING-PLACE';
                        nextStates.push(state);
                        break;
                    }
                }
            }
            return nextStates;
        },
        // Non-king waste to an eligible tableau
        (stateJson) => {
            const nextStates = [];
            for (let i = 0; i < 7; i++) {
                const state = JSON.parse(stateJson);
                if (state.waste.length > 0 &&
                    state.tableaus[i].filter(c => c & 64).length > 0 &&
                    Card.getRank(end(state.waste)) === Card.getRank(end(state.tableaus[i])) - 1 &&
                    Card.areOpposite(end(state.waste), end(state.tableaus[i]))
                ) {
                    state.tableaus[i].push(state.waste.pop());
                    state.moveType = 'PLACE';
                    nextStates.push(state);
                }
            }
            return nextStates;
        },
        // Draw
        (stateJson) => {
            const nextStates = [];
            const state = JSON.parse(stateJson);
            if (state.stock.length > 0) {
                state.waste.push(state.stock.pop() | 64);
                state.moveType = 'DRAW';
                nextStates.push(state);
            }
            return nextStates;
        },
        // Reset
        (stateJson) => {
            const nextStates = [];
            const state = JSON.parse(stateJson);
            if (state.stock.length === 0 && state.waste.length > 0) {
                for (let i = 1; i <= state.waste.length; i++) {
                    state.stock.push(state.waste[state.waste.length - i] ^ 64);
                }
                state.waste = [];
                state.moveType = 'RESET';
                nextStates.push(state);
            }
            return nextStates;
        },
    ],
    next: async (state, depth = 0) => {
        const hash = await sha256(state);
        Solitaire.visitedStateHashes.push(hash);
        Solitaire.movesMade++;

        // If all the cards are in the foundations, assume they're in order
        if (state.foundations.filter(f => f.length === 13).length === 4) {
            Solitaire.isSearching = false;
            Solitaire.isWinnable = true;
            Solitaire.render(state, depth);
        }
        if (Solitaire.movesMade > Solitaire.MAX_MOVES) {
            Solitaire.isSearching = false;
            Solitaire.isWinnable = false;
            Solitaire.render(state, depth);
        }
        if (Solitaire.isSearching) {
            Solitaire.render(state, depth);
        }

        if (Solitaire.isSearching) {
            let validMoves = [];
            let newMoves = [];
            Solitaire.moves.forEach((move) => {
                validMoves = validMoves.concat(move(JSON.stringify(state)));
            });
            for (let i = 0; i < validMoves.length; i++) {
                const newHash = await sha256(validMoves[i]);
                if (!Solitaire.visitedStateHashes.includes(newHash)) {
                    newMoves.push(validMoves[i]);
                }
            }

            for (let i = 0; i < newMoves.length; i++) {
                await Solitaire.next(newMoves[i], depth + 1);
            }
        }
    },
};
window.onload = function() {
    Solitaire.init();
};
