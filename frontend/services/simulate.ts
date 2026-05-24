/// <reference types="node" />

import { execFile, type ExecFileException } from 'node:child_process';
import * as path from 'node:path';

/**
 * Executa o ModelSim instalado na máquina local para simular o hardware.
 * Defina MODELSIM_BIN com o caminho completo do executável, se ele não estiver no PATH.
 * @param hardwarePath Caminho absoluto para a pasta com os arquivos .v, .sv e o .do
 */
function runHardwareSimulation(hardwarePath: string): void {
    const resolvedPath = path.resolve(hardwarePath);

    const modelsimExecutable = process.env.MODELSIM_BIN ?? 'vsim';
    const modelsimArgs = ['-c', '-do', 'rodar_simulacao.do'];

    print(`Iniciando simulação local para a pasta: ${resolvedPath}...`);
    print(`Usando ModelSim em: ${modelsimExecutable}`);

    execFile(modelsimExecutable, modelsimArgs, { cwd: resolvedPath }, (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error) {
            print(`[ERRO NA EXECUÇÃO]: ${error.message}`);
            return;
        }
        if (stderr) {
            print(`[MODELSIM WARNINGS/ERRORS]:\n${stderr}`);
        }
        print(`[MODELSIM OUTPUT]:\n${stdout}`);
        print("Simulação concluída com sucesso! Log gerado.");
    });
}

// Utilitário para exibição limpa
function print(msg: string): void {
    console.log(msg);
}

// Exemplo de uso: aponta para a pasta atual ou onde estão seus 23 arquivos
runHardwareSimulation("./verilog_code");