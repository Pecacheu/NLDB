# NovaLabs Database System
#### Code by Pecacheu @ GitHub

## Key Controls
#### Everywhere:
`Home` = Index/Search -- **TODO**\
`Alt` or `ContextMenu` = Toggle Edit Mode -- **TODO**\
`CTRL` = Usage Help (General help and tips + controls) -- **TODO**

#### Edit Mode:
`Insert` = Add Element -- **TODO**\
`Escape` = Cancel Edit Mode -- **TODO**

#### When Dragging or Renaming:
`Enter` = Confirm Name Edit\
`Escape` = Cancel Drag/Name Edit

## Todo List
- ~~Login system?~~
- ~~Close menu when leaving edit mode~~
- ~~Regex test for names~~
- ~~LOTS of user input sanitization on server side, prevent SQL injection~~
- ~~Less intrusive loading screen for after first load, delay before animation plays~~
- ~~ID = -1 of tcat used for headline feature (shown on index page on 3rd line)~~
- ~~When listing items for index, only pull required columns (incl headline column) instead of *~~
- ~~Improve performance with asynchronous DB requests where possible~~
- ~~Implement locking mechanism for async JavaScript Promises~~
- ~~Force-close menu before dbSave~~
- ~~Upload fail shouldn't refresh page & delete user's edits!~~
- ~~Edit CAT/SUB~~
- ~~Grey out save button while saving~~
- ~~Add separate date and date + time option~~
- ~~Align data fields to max len, size adjusts to 100% for vertical on mobile~~
- ~~Redirect back to prev page after login, using 'state' var to store query string?~~
- ~~Use Postgres transactions where needed on server-side.~~
- Create New CAT
- Create New SUB
- Rename CAT/SUB
- Prevent duplicate CAT/SUB field names server-side, will confuse swap algorithm. Error: "Duplicate Name @ Index <i>"
- More intuitive interface to get to CAT edit screen?
- Server-End: In Cat update, add check to not send redundant SQL update request for unchanged rows.
- Later: Proper user management screen with logout button?
- Should field names be stored lower case, or not? Should swap check do a case-insensitive search or not?
- Don't allow field name "Name" because WHY WOULD YOU DO THAT
- Implement search system
- Later: Advanced search?
- Later: Ability to filter for items that don't contain a value for a field (aka find missing data)
- Database table view/edit mode (Maybe just use existing Postgres GUI software for this)
- Add controls & help menu
- DB health check: Test for mismatch between itm cols & CAT/SUB rows. Also checks that there are no gaps in 'i' values.
- Set all sub fields to null if item's subcat changed? Send null fields on update even if fields don't exist on page
- Refresh/redraw page so new subcat fields (or lack thereof) will show up.
- Switch to cancel button upon any data edit, even out of EDIT mode
- Duplicate item option?
- GZip compression for served content
- No-cache on DB responses; Use cache for all else
- Any sort of undo/snapshot option for PostgreSQL?
- User action logging