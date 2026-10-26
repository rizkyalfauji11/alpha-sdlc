const path = require('path');

function parseToolPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      isAntigravity: false,
      isGeminiCli: false,
      rawToolName: '',
      toolName: '',
      toolInput: {},
      filePath: '',
      writtenContent: '',
      command: '',
      cwd: process.cwd(),
    };
  }

  if (payload.toolCall && typeof payload.toolCall === 'object') {
    const rawName = String(payload.toolCall.name || '');
    const args = payload.toolCall.args || {};
    let toolName = rawName;
    if (rawName === 'write_file') toolName = 'Write';
    else if (rawName === 'edit_file') toolName = 'Edit';
    else if (rawName === 'run_command') toolName = 'Bash';

    const filePath = typeof args.Path === 'string' ? args.Path : (typeof args.path === 'string' ? args.path : (typeof args.file_path === 'string' ? args.file_path : ''));
    const writtenContent = toolName === 'Write'
      ? (typeof args.Content === 'string' ? args.Content : (typeof args.content === 'string' ? args.content : ''))
      : toolName === 'Edit'
      ? (typeof args.Replacement === 'string' ? args.Replacement : (typeof args.new_string === 'string' ? args.new_string : ''))
      : '';
    const command = typeof args.CommandLine === 'string' ? args.CommandLine : (typeof args.command === 'string' ? args.command : '');

    const cwd = (Array.isArray(payload.workspacePaths) && payload.workspacePaths[0]) || payload.cwd || process.cwd();

    const toolInput = {
      file_path: filePath,
      content: typeof args.Content === 'string' ? args.Content : (args.content || ''),
      old_string: typeof args.Target === 'string' ? args.Target : (args.old_string || ''),
      new_string: typeof args.Replacement === 'string' ? args.Replacement : (args.new_string || ''),
      command,
      replace_all: args.replaceAll ?? args.replace_all ?? false,
      ...args,
    };

    return {
      isAntigravity: true,
      isGeminiCli: false,
      rawToolName: rawName,
      toolName,
      toolInput,
      filePath,
      writtenContent,
      command,
      cwd,
    };
  }

  if (payload.tool_args && typeof payload.tool_args === 'object') {
    const rawName = String(payload.tool_name || '');
    let toolName = rawName;
    if (rawName === 'write_file') toolName = 'Write';
    else if (rawName === 'replace' || rawName === 'edit' || rawName === 'edit_file') toolName = 'Edit';
    else if (rawName === 'run_shell_command' || rawName === 'bash') toolName = 'Bash';

    const args = payload.tool_args;
    const filePath = typeof args.path === 'string' ? args.path : (typeof args.file_path === 'string' ? args.file_path : '');
    const writtenContent = toolName === 'Write'
      ? (typeof args.content === 'string' ? args.content : '')
      : toolName === 'Edit'
      ? (typeof args.new_string === 'string' ? args.new_string : (typeof args.Replacement === 'string' ? args.Replacement : ''))
      : '';
    const command = typeof args.command === 'string' ? args.command : (typeof args.CommandLine === 'string' ? args.CommandLine : '');
    const cwd = payload.cwd || process.cwd();

    const toolInput = {
      file_path: filePath,
      content: typeof args.content === 'string' ? args.content : '',
      old_string: typeof args.old_string === 'string' ? args.old_string : (typeof args.Target === 'string' ? args.Target : ''),
      new_string: typeof args.new_string === 'string' ? args.new_string : (typeof args.Replacement === 'string' ? args.Replacement : ''),
      command,
      ...args,
    };

    return {
      isAntigravity: false,
      isGeminiCli: true,
      rawToolName: rawName,
      toolName,
      toolInput,
      filePath,
      writtenContent,
      command,
      cwd,
    };
  }

  const rawName = String(payload.tool_name || '');
  let toolName = rawName;
  if (rawName === 'write_file') toolName = 'Write';
  else if (rawName === 'edit_file') toolName = 'Edit';
  else if (rawName === 'run_command') toolName = 'Bash';

  const toolInput = payload.tool_input || {};
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : (typeof toolInput.Path === 'string' ? toolInput.Path : (typeof toolInput.path === 'string' ? toolInput.path : ''));
  const writtenContent = toolName === 'Write'
    ? (typeof toolInput.content === 'string' ? toolInput.content : (typeof toolInput.Content === 'string' ? toolInput.Content : ''))
    : toolName === 'Edit'
    ? (typeof toolInput.new_string === 'string' ? toolInput.new_string : (typeof toolInput.Replacement === 'string' ? toolInput.Replacement : ''))
    : '';
  const command = typeof toolInput.command === 'string' ? toolInput.command : (typeof toolInput.CommandLine === 'string' ? toolInput.CommandLine : '');
  const cwd = payload.cwd || process.cwd();

  return {
    isAntigravity: Boolean(payload.conversationId && !payload.tool_name),
    isGeminiCli: false,
    rawToolName: rawName,
    toolName,
    toolInput,
    filePath,
    writtenContent,
    command,
    cwd,
  };
}

function blockTool(message, isAntigravity) {
  if (isAntigravity) {
    process.stdout.write(JSON.stringify({ decision: 'deny', reason: message.trim() }));
    return 0;
  }
  process.stderr.write(message);
  return 2;
}

function allowTool(isAntigravity) {
  if (isAntigravity) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  }
  return 0;
}

function isAntigravitySession(payload) {
  return Boolean(
    payload &&
    (payload.conversationId !== undefined ||
     payload.workspacePaths !== undefined ||
     payload.terminationReason !== undefined ||
     payload.toolCall !== undefined)
  );
}

module.exports = {
  parseToolPayload,
  blockTool,
  allowTool,
  isAntigravitySession,
};
