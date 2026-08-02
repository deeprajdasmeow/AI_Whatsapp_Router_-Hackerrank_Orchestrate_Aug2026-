const fs = require('fs');
const csv = require('csv-parser');

// Helper: Loads a CSV into a key-value dictionary
function loadCsvToMap(filePath, keyField) {
    return new Promise((resolve, reject) => {
        const map = {};
        if (!fs.existsSync(filePath)) {
            console.warn(`Warning: File ${filePath} not found.`);
            return resolve(map);
        }
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => { 
                if (row[keyField]) {
                    map[row[keyField]] = row; 
                }
            })
            .on('end', () => resolve(map))
            .on('error', reject);
    });
}

async function runEvaluation() {
    console.log("Loading predictions from output.csv and ground truth from dataset...\n");

    const predictionsMap = await loadCsvToMap('./output.csv', 'message_id');
    
    // Checks messages.csv first, then sample_messages.csv if needed
    let groundTruthMap = await loadCsvToMap('./dataset/messages.csv', 'message_id');
    if (Object.keys(groundTruthMap).length === 0) {
        groundTruthMap = await loadCsvToMap('./dataset/sample_messages.csv', 'message_id');
    }

    let totalEvaluated = 0;
    let correct = 0;

    const stats = {
        notify: { expected: 0, predicted: 0, correct: 0 },
        digest: { expected: 0, predicted: 0, correct: 0 },
        mute:   { expected: 0, predicted: 0, correct: 0 }
    };

    for (const [id, truthRow] of Object.entries(groundTruthMap)) {
        // Looks for common ground-truth column header names
        const expected = (truthRow.expected_decision || truthRow.ground_truth || truthRow.decision || '').trim().toLowerCase();
        
        // Skip messages in the test set that do not have ground truth validation labels
        if (!expected || !['notify', 'digest', 'mute'].includes(expected)) {
            continue;
        }

        const predRow = predictionsMap[id];
        const predicted = predRow ? (predRow.decision || '').trim().toLowerCase() : 'none';

        totalEvaluated++;

        if (stats[expected]) stats[expected].expected++;
        if (stats[predicted]) stats[predicted].predicted++;

        if (expected === predicted) {
            correct++;
            if (stats[expected]) stats[expected].correct++;
        }
    }

    if (totalEvaluated === 0) {
        console.log("No ground-truth labels were detected in the dataset file.");
        console.log("Make sure your dataset contains validation rows with an 'expected_decision' or 'decision' column.");
        return;
    }

    const accuracy = ((correct / totalEvaluated) * 100).toFixed(2);

    console.log("==========================================");
    console.log("          EVALUATION RESULTS              ");
    console.log("==========================================");
    console.log(`Total Validated Messages : ${totalEvaluated}`);
    console.log(`Correct Predictions      : ${correct}`);
    console.log(`Overall Accuracy Score   : ${accuracy}%\n`);

    console.log("------------------------------------------");
    console.log("Category Breakdown:");
    console.log("------------------------------------------");

    for (const cat of ['notify', 'digest', 'mute']) {
        const { expected, predicted, correct: catCorrect } = stats[cat];
        const precision = predicted > 0 ? ((catCorrect / predicted) * 100).toFixed(1) + '%' : 'N/A';
        const recall = expected > 0 ? ((catCorrect / expected) * 100).toFixed(1) + '%' : 'N/A';

        console.log(`[${cat.toUpperCase()}]`);
        console.log(`  Expected  : ${expected}`);
        console.log(`  Predicted : ${predicted}`);
        console.log(`  Correct   : ${catCorrect}`);
        console.log(`  Precision : ${precision}`);
        console.log(`  Recall    : ${recall}\n`);
    }
}

runEvaluation();