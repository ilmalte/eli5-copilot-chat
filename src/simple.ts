import { renderPrompt } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { PlayPrompt } from './play';

const ELI5_NAMES_COMMAND_ID = 'eli5.namesInEditor';
const ELI5_PARTICIPANT_ID = 'chat.eli5';

interface IEli5ChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

export function registerSimpleParticipant(context: vscode.ExtensionContext) {

    // Define a ELI5 chat handler.
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<IEli5ChatResult> => {
        if (request.command === 'randomTeach') {
            stream.progress('Thinking of a fun topic to explain...');
            const topic = getTopic(context.history);
            try {
                const messages = [
                    vscode.LanguageModelChatMessage.User('You the smartest 5-year-old ever! Explain computer science concepts in a super simple way, like you’re talking to a 5-year-old. Use fun analogies, emojis, and examples.'),
                    vscode.LanguageModelChatMessage.User(topic)
                ];

                const chatResponse = await request.model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }

            } catch (err) {
                handleError(logger, err, stream);
            }

            stream.button({
                command: ELI5_NAMES_COMMAND_ID,
                title: vscode.l10n.t('Use Kid Names in Editor')
            });

            logger.logUsage('request', { kind: 'randomTeach' });
            return { metadata: { command: 'randomTeach' } };
        } else if (request.command === 'play') {
            stream.progress('Getting ready to play and have fun!');
            try {
                const { messages } = await renderPrompt(
                    PlayPrompt,
                    { userQuery: request.prompt },
                    { modelMaxPromptTokens: request.model.maxInputTokens },
                    request.model);

                const chatResponse = await request.model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }

            } catch (err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: 'play' });
            return { metadata: { command: 'play' } };
        } else {
            try {
                const messages = [
                    vscode.LanguageModelChatMessage.User(`You the smartest 5-year-old ever! Explain computer science concepts in a super simple way, like you’re talking to a 5-year-old. Use fun analogies, emojis, and examples.`),
                    vscode.LanguageModelChatMessage.User(request.prompt)
                ];

                const chatResponse = await request.model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }
            } catch (err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: '' });
            return { metadata: { command: '' } };
        }
    };

    const eli5 = vscode.chat.createChatParticipant(ELI5_PARTICIPANT_ID, handler);
    eli5.iconPath = vscode.Uri.joinPath(context.extensionUri, 'eli5.png');
    eli5.followupProvider = {
        provideFollowups(_result: IEli5ChatResult, _context: vscode.ChatContext, _token: vscode.CancellationToken) {
            return [{
                prompt: 'let us play',
                label: vscode.l10n.t('Play with the kid'),
                command: 'play'
            } satisfies vscode.ChatFollowup];
        }
    };

    const logger = vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            console.log(`Event: ${eventName}`);
            console.log(`Data: ${JSON.stringify(data)}`);
        },
        sendErrorData(error, data) {
            console.error(`Error: ${error}`);
            console.error(`Data: ${JSON.stringify(data)}`);
        }
    });

    context.subscriptions.push(eli5.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
        logger.logUsage('chatResultFeedback', {
            kind: feedback.kind
        });
    }));

    context.subscriptions.push(
        eli5,
        vscode.commands.registerTextEditorCommand(ELI5_NAMES_COMMAND_ID, async (textEditor: vscode.TextEditor) => {
            const text = textEditor.document.getText();

            let chatResponse: vscode.LanguageModelChatResponse | undefined;
            try {
                const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
                if (!model) {
                    console.log('Model not found. Please make sure the GitHub Copilot Chat extension is installed and enabled.');
                    return;
                }

                const messages = [
                    vscode.LanguageModelChatMessage.User(`You the smartest 5-year-old ever! Replace all variable names in the following code with fun and playful names. Be creative. IMPORTANT respond just with code. Do not use markdown!`),
                    vscode.LanguageModelChatMessage.User(text)
                ];
                chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            } catch (err) {
                if (err instanceof vscode.LanguageModelError) {
                    console.log(err.message, err.code, err.cause);
                } else {
                    throw err;
                }
                return;
            }

            await textEditor.edit(edit => {
                const start = new vscode.Position(0, 0);
                const end = new vscode.Position(textEditor.document.lineCount - 1, textEditor.document.lineAt(textEditor.document.lineCount - 1).text.length);
                edit.delete(new vscode.Range(start, end));
            });

            try {
                for await (const fragment of chatResponse.text) {
                    await textEditor.edit(edit => {
                        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                        const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                        edit.insert(position, fragment);
                    });
                }
            } catch (err) {
                await textEditor.edit(edit => {
                    const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                    const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                    edit.insert(position, (err as Error).message);
                });
            }
        }),
    );
}

function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    logger.logError(err);

    if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(vscode.l10n.t('I can only explain computer science concepts in a kid-friendly way.'));
        }
    } else {
        throw err;
    }
}

function getTopic(history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>): string {
    const topics = ['what is a computer', 'how does the internet work', 'what is a loop', 'what is a function', 'what is a variable'];
    const previousKidResponses = history.filter(h => {
        return h instanceof vscode.ChatResponseTurn && h.participant === ELI5_PARTICIPANT_ID;
    }) as vscode.ChatResponseTurn[];
    const topicsNoRepetition = topics.filter(topic => {
        return !previousKidResponses.some(kidResponse => {
            return kidResponse.response.some(r => {
                return r instanceof vscode.ChatResponseMarkdownPart && r.value.value.includes(topic);
            });
        });
    });

    return topicsNoRepetition[Math.floor(Math.random() * topicsNoRepetition.length)] || 'I have taught you everything I know!';
}
