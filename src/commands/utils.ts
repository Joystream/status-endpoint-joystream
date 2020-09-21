import inquirer from 'inquirer';

export const confirm = async (message: string): Promise<boolean> => {
    const { answer } = await inquirer.prompt([{
        type: 'confirm',
        name: 'answer',
        message,
        default: false
    }]);

    return answer;
}