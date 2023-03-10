import { argv } from './index.mjs';

export async function runJobs(count: number, process: (i: number) => Promise<void>): Promise<void> {
    const simultaneousJobs = argv.jobs;

    const continuedProcess = async (i: number) => {
        await process(i);
        if ((i + simultaneousJobs) < count) {
            await continuedProcess(i + simultaneousJobs);
        }
    };

    const init = Array.from({ length: simultaneousJobs }, (_, i) => continuedProcess(i));
    await Promise.all(init);
}
