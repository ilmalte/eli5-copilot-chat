import * as vscode from 'vscode';
import * as chatUtils from '@vscode/chat-extension-utils';

export function registerChatLibChatParticipant(context: vscode.ExtensionContext) {
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
        if (request.command === 'list') {
            stream.markdown(`Available tools: ${vscode.lm.tools.map(tool => tool.name).join(', ')}\n\n`);
            return;
        }

        const tools = request.command === 'all' ?
            vscode.lm.tools :
            vscode.lm.tools.filter(tool => tool.tags.includes('chat-tools'));

        const libResult = chatUtils.sendChatParticipantRequest(
            request,
            chatContext,
            {
                prompt: 'You are the smartest 5-year-old ever! Answer like a super-intelligent kid, using crayons, metaphors, and playful examples.',
                responseStreamOptions: {
                    stream,
                    references: true,
                    responseText: true
                },
                tools
            },
            token);

        return await libResult.result;
    };

    const chatLibParticipant = vscode.chat.createChatParticipant('chat-tools.eli5Tools', handler);
    chatLibParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'eli5.png');
    context.subscriptions.push(chatLibParticipant);
}