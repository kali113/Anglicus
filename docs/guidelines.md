# Writing a good CLAUDE.md / AGENTS.md

> Use this guide when auto-generating or updating AGENTS.md files.

## Principle: LLMs are (mostly) stateless
LLMs are stateless functions. Their weights are frozen by the time they're used for inference, so they don't learn over time. The only thing that the model knows about your codebase is the tokens you put into it.

Similarly, coding agent harnesses such as Claude Code usually require you to manage agents' memory explicitly. CLAUDE.md (or AGENTS.md) is the only file that by default goes into every single conversation you have with the agent.

This has three important implications:

1. Coding agents know absolutely nothing about your codebase at the beginning of each session.
2. The agent must be told anything that's important to know about your codebase each time you start a session.
3. CLAUDE.md is the preferred way of doing this.

## CLAUDE.md onboards Claude to your codebase
Since Claude doesn't know anything about your codebase at the beginning of each session, you should use CLAUDE.md to onboard Claude into your codebase. At a high level, this means it should cover:

- **WHAT**: tell Claude about the tech, your stack, the project structure. Give Claude a map of the codebase. This is especially important in monorepos! Tell Claude what the apps are, what the shared packages are, and what everything is for so that it knows where to look for things
- **WHY**: tell Claude the purpose of the project and what everything is doing in the repository. What are the purpose and function of the different parts of the project?
- **HOW**: tell Claude how it should work on the project. For example, do you use bun instead of node? You want to include all the information it needs to actually do meaningful work on the project. How can Claude verify Claude's changes? How can it run tests, typechecks, and compilation steps?

But the way you do this is important! Don't try to stuff every command Claude could possibly need to run in your CLAUDE.md file - you will get sub-optimal results.

## Claude often ignores CLAUDE.md
Regardless of which model you're using, you may notice that Claude frequently ignores your CLAUDE.md file's contents.

Claude Code injects the following system reminder with your CLAUDE.md file in the user message to the agent:

```
<system-reminder>
      IMPORTANT: this context may or may not be relevant to your tasks. 
      You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
```

As a result, Claude will ignore the contents of your CLAUDE.md if it decides that it is not relevant to its current task. The more information you have in the file that's not universally applicable to the tasks you have it working on, the more likely it is that Claude will ignore your instructions in the file.

## Creating a good CLAUDE.md file

### Less (instructions) is more
It can be tempting to try and stuff every single command that claude could possibly need to run, as well as your code standards and style guidelines into CLAUDE.md. We recommend against this.

Key findings:
- Frontier thinking LLMs can follow ~150-200 instructions with reasonable consistency
- Smaller models get MUCH worse, MUCH more quickly with exponential decay in instruction-following
- LLMs bias towards instructions at the peripheries of the prompt (beginning and end)
- As instruction count increases, instruction-following quality decreases uniformly

Claude Code's system prompt contains ~50 individual instructions. Your CLAUDE.md file should contain as few instructions as possible - ideally only ones which are universally applicable to your task.

### CLAUDE.md file length & applicability
All else being equal, an LLM will perform better on a task when its context window is full of focused, relevant context.

Since CLAUDE.md goes into every single session, you should ensure that its contents are as universally applicable as possible.

**Avoid** including instructions about (for example) how to structure a new database schema - this won't matter when working on unrelated tasks!

**Length**: < 300 lines is best, and shorter is even better. Aim for < 60 lines if possible.

### Progressive Disclosure
Instead of including all instructions in your CLAUDE.md file, keep task-specific instructions in separate markdown files:

```
docs/
  |- architecture.md
  |- security.md
  |- exercises.md
  |- spanish-errors.md
```

Then, in your CLAUDE.md file, include a list of these files with brief descriptions. Instruct Claude to read them only when relevant.

**Prefer pointers to copies.** Don't include code snippets - they become out-of-date quickly. Use file:line references instead.

### Claude is (not) an expensive linter
Never send an LLM to do a linter's job. LLMs are comparably expensive and incredibly slow compared to traditional linters and formatters.

LLMs are in-context learners! If your code follows conventions, Claude should follow existing patterns without being told.

Consider:
- Setting up a Claude Code Stop hook that runs your formatter & linter
- Using a linter that can auto-fix issues (like Biome)
- Creating Slash Commands for code guidelines

### Don't use /init or auto-generate your CLAUDE.md
Because CLAUDE.md goes into every single session, it is one of the highest leverage points of the harness.

A bad line in CLAUDE.md affects every single phase of your workflow and every artifact produced. Spend time thinking carefully about every single line that goes into it.

## Summary Checklist

- [ ] Defines project's WHAT, WHY, and HOW
- [ ] Contains < 60 lines (ideal) or < 300 lines (max)
- [ ] Only universally applicable instructions
- [ ] Uses Progressive Disclosure (pointers to docs, not inline content)
- [ ] No code style guidelines (use linters instead)
- [ ] No auto-generated content without review
- [ ] Clear project structure map
- [ ] Essential commands only (build, test, typecheck)
