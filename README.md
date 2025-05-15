# NovaLabs Database System
#### Code by Pecacheu @ GitHub

## Key Controls
#### Everywhere:
`Home` = Index/Search\
`Alt` or `ContextMenu` = Toggle Edit Mode\
`CTRL` = Usage Help (General help and tips + controls) -- **TODO**\
`Escape` = Go Back

#### In Menu:
`Escape` = Close Menu

#### Edit Mode:
`Insert` = Add Item\
`Escape` = Cancel Edit Mode

#### When Dragging or Renaming:
`Enter` = Confirm Name Edit\
`Escape` = Cancel Drag/Edit

## User Auth Levels
- `0` General user
- `1` View rights for category info (TBD: Is this useful without edit perms?)
- `2` Edit rights for cat, sub-cat, and items
- `3` Admin, create new categories

## Todo List
- Delete images when they are no longer used somehow?
- Check for max array length, value length in update item & update tcat
- Item: Change Cat
- Rename CAT/SUB
- Delete Item
- Delete CAT/SUB
- Implement search system
- Later: Proper user management screen with logout button?
- Later: Advanced search?
- Later: Ability to filter for items that don't contain a value for a field (aka find missing data)
- Add help menu **(HALP ME)**
- DB health check: Test for mismatch between itm cols & CAT/SUB rows. Also checks that there are no gaps in 'i' values.
- Set all sub fields to null if item's subcat changed? Send null fields on update even if fields don't exist on page
- Switch to cancel button upon any data edit, even out of EDIT mode?
- GZip compression for served content
- No-cache on DB responses; Use cache for all else
- Any sort of undo/snapshot option for PostgreSQL? < Working on
- Improved file-loader interface
- List All: Replace with for-in loop
- New Item/Cat: Rate-limit?
- Set user perms via web if admin