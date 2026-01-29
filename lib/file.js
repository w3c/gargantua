import { PLATFORM } from './config.js';

class FileError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'FileError';
    }
}

export function file() {
    return (PLATFORM === 'bun' || PLATFORM === 'node');
}

export async function read(url) {
    if (PLATFORM === 'bun') {
        const file = await Bun.file(url);
        return file.text();
    }
    else if (PLATFORM === 'node') {
        const fs = await import('fs/promises');
        return fs.readFile(url, 'utf-8');
    }
    else {
        throw new FileError('File operations are not supported in this environment');
    }
}

export async function write(url, data) {
    if (PLATFORM === 'bun') {
        return Bun.write(url, data);
    }
    else if (PLATFORM === 'node') {
        const fs = await import('fs/promises');
        return fs.writeFile(url, data, 'utf-8');
    }
    else {
        throw new FileError('File operations are not supported in this environment');
    }
}