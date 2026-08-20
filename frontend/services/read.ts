import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

interface LogCiclo {
    ciclo: number;
    pc_atual: string;
    instrucao: string;
    registradores: Record<string, number>;
    bolha: string;
    flush: string;
    btb_predito: string;
    btb_alvo: string;
    branch_tomado: string;
    ula_resultado: string;
    [key: string]: any; // Para cobrir outras variáveis dinâmicas
}

/**
 * Lê o arquivo NDJSON e exibe o estado do hardware em um ciclo específico
 * @param logPath Caminho para o arquivo execucao_pipeline.json
 * @param targetCycle O número do ciclo que deseja inspecionar (ex: 3)
 */
function getHardwareStateAtCycle(logPath: string, targetCycle: number): void {
    const absoluteLogPath = path.resolve(logPath);
    
    if (!fs.existsSync(absoluteLogPath)) {
        console.error(`Erro: Arquivo de log não encontrado em ${absoluteLogPath}`);
        return;
    }

    const fileStream = fs.createReadStream(absoluteLogPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let encontrado = false;

    rl.on('line', (line) => {
        if (!line.trim()) return;

        try {
            const estadoCiclo: LogCiclo = jsonParse(line);

            if (estadoCiclo.ciclo === targetCycle) {
                encontrado = true;
                rl.close(); // Fecha o leitor de arquivo mais cedo para economizar memória
                exibirEstado(estadoCiclo);
            }
        } catch (err) {
            console.error("Erro ao processar linha do log:", err);
        }
    });

    rl.on('close', () => {
        if (!encontrado) {
            console.log(`A simulação terminou, mas o ciclo ${targetCycle} não foi encontrado no log.`);
        }
    });
}

// Wrapper seguro para o JSON parser
function jsonParse(text: string): any {
    return JSON.parse(text);
}

// Formata e exibe os dados de forma elegante no console
function exibirEstado(estado: LogCiclo): void {
    console.log("==================================================");
    console.log(`       ESTADO DO HARDWARE NO CICLO: ${estado.ciclo} `);
    console.log("==================================================");
    console.log(`PC Atual:        0x${estado.pc_atual}`);
    console.log(`Instrução:       0x${estado.instrucao}`);
    console.log(`Controle/Hazard: Bolha=${estado.bolha} | Flush=${estado.flush}`);
    console.log(`Predição BTB:    Predito=${estado.btb_predito} | Alvo=0x${estado.btb_alvo}`);
    console.log(`Resultado ULA:   0x${estado.ula_resultado}`);
    console.log("--------------------------------------------------");
    console.log("Registradores Ativos (Diferentes de Zero):");
    
    for (const [reg, val] of Object.entries(estado)) {
        if (val !== 0) {
            console.log(`  ${reg}: ${val}`);
        }
    }
    console.log("==================================================");
}

// Executa a leitura buscando o ciclo 3
getHardwareStateAtCycle("./execucao_pipeline.json", 3);