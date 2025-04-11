import {
	BasePromptElementProps,
	PromptElement,
	PromptSizing,
	UserMessage
} from '@vscode/prompt-tsx';

export interface PromptProps extends BasePromptElementProps {
	userQuery: string;
}

export class PlayPrompt extends PromptElement<PromptProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return (
			<>
				<UserMessage>
					You are the smartest 5-year-old ever! Reply in the voice of a super-intelligent kid, using crayons, metaphors, and playful examples. Be concise and fun. Give a small random Python code sample (with playful variable names like "juiceBox" or "crayonColor").
				</UserMessage>
			</>
		);
	}
}
