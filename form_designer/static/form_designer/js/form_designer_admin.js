/*
 * Admin enhancements for form_designer's FormDefinitionField inlines:
 *
 *   - collapse whole inlines and individual fieldsets,
 *   - mirror the "name" field into the inline header while typing,
 *   - prepopulate "label" from "name" (without slugifying),
 *   - drag-and-drop reordering that maintains the hidden "position" field.
 *
 * This uses the jQuery that Django's admin already ships as `django.jQuery`.
 */
'use strict';

django.jQuery(function ($) {
    var gettext = window.gettext || function (s) { return s; };

    var GROUP_SEL = '#formdefinitionfield_set-group';
    // The last `.inline-related` is Django's hidden template row; skip it.
    var ITEM_SEL = '.inline-related:not(.empty-form)';
    var POSITION_SEL = 'input[id$=-position]';
    var DRAGGING_CLASS = 'dfd-dragging';

    var $group = $(GROUP_SEL);
    if (!$group.length) {
        return;
    }

    function rows() {
        return $group.find(ITEM_SEL);
    }

    function nextElement(el) {
        var node = el.nextSibling;
        while (node && node.nodeType !== 1) {
            node = node.nextSibling;
        }
        return node;
    }

    // --- Collapsing --------------------------------------------------------

    function makeCollapsible($scope, itemSel, collapsibleSel, triggerTargetSel,
                            initStatusOverride, firstStatusOverride) {
        var triggerExpand = gettext('Show');
        var triggerCollapse = gettext('Hide');
        var triggerClass = 'collapse-expand';

        $scope.find(itemSel).each(function (i) {
            var item = this;
            var $item = $(item);
            if ($item.data('dfdCollapsible')) {
                return;
            }
            $item.data('dfdCollapsible', true);

            $item.find(collapsibleSel).hide();

            var $target = $item.find(triggerTargetSel).first();
            var $trigger = $target.find('.' + triggerClass);
            if (!$trigger.length) {
                $trigger = $('<a class="' + triggerClass + '" href="#"></a>');
                $target.append(' (').append($trigger).append(')');
            }

            var open;
            function toggle(show) {
                open = (show == null) ? !open : show;
                if (open) {
                    $trigger.text(triggerCollapse);
                    $item.find(collapsibleSel).show();
                } else {
                    $trigger.text(triggerExpand);
                    $item.find(collapsibleSel).hide();
                }
            }

            $trigger.on('click', function (event) {
                event.preventDefault();
                toggle(null);
            });
            // Expose the toggle so freshly added rows can be forced open.
            $item.data('dfdToggle', toggle);

            // Collapse by default, but keep anything with errors open.
            var initStatus = initStatusOverride != null
                ? initStatusOverride
                : $item.find('.errors').length !== 0;
            var firstStatus = firstStatusOverride != null
                ? firstStatusOverride
                : initStatus;
            toggle(i === 0 ? firstStatus : initStatus);
        });
    }

    // --- Inline header / label helpers -------------------------------------

    function initRename() {
        rows().each(function () {
            var $item = $(this);
            if ($item.data('dfdRename')) {
                return;
            }
            $item.data('dfdRename', true);

            var $input = $item.find('input[id*=-name]');
            var $label = $item.find('.inline_label');
            function rename(evenIfEmpty) {
                if (evenIfEmpty || $input.val()) {
                    $label.text($input.val());
                }
            }
            $input.on('keyup', function () {
                rename(true);
            });
            rename(false);
        });
    }

    function initPrepopulateLabel() {
        rows().each(function () {
            var $item = $(this);
            if ($item.data('dfdPrepopulate')) {
                return;
            }
            $item.data('dfdPrepopulate', true);

            var $label = $item.find('input[id*=-label]');
            var $name = $item.find('input[id*=-name]');
            if (!$label.length || !$name.length) {
                return;
            }

            // Only auto-fill the label until the user edits it themselves.
            var labelEdited = $name.val() !== $label.val();
            $label.on('change', function () {
                labelEdited = true;
            });
            $name.on('keyup', function () {
                if (!labelEdited) {
                    $label.val($name.val());
                }
            });
        });
    }

    // --- Drag-and-drop reordering ------------------------------------------

    function renumber() {
        var pos = 1;
        rows().each(function () {
            var $position = $(this).find(POSITION_SEL);
            // Leave untouched rows (blank position) blank; number the rest.
            if ($position.val() !== '') {
                $position.val(pos);
                pos += 1;
            }
        });
    }

    function setupRow(item) {
        var $item = $(item);
        if ($item.data('dfdSortableRow')) {
            return;
        }
        $item.data('dfdSortableRow', true);

        var $handle = $item.find('h3 b').first();
        $handle.css('cursor', 'move').addClass('draggable');

        // Only become draggable when the gesture starts on the handle, so
        // text selection inside the fields keeps working.
        $handle.on('mousedown', function () {
            item.draggable = true;
        });
        $item.on('mouseup', function () {
            item.draggable = false;
        });

        // Replace the visible "position" field with a hidden input so it
        // can't be edited by hand; drag-ordering manages it instead.
        $item.find(POSITION_SEL).each(function () {
            var $field = $(this);
            var $formRow = $field.closest('.form-row');
            if (!$formRow.length) {
                return;
            }
            var $hidden = $('<input type="hidden">')
                .attr('id', this.id)
                .attr('name', this.name)
                .val($field.val());
            $formRow.replaceWith($hidden);
        });

        // Editing any field gives a (previously blank) row a position.
        $item.find('input, select, textarea').on('change', function () {
            $item.find(POSITION_SEL).val('X'); // placeholder; renumber() fills it in
            renumber();
        });
    }

    function dragAfterElement(y) {
        var result = null;
        rows().not('.' + DRAGGING_CLASS).each(function () {
            if (result !== null) {
                return;
            }
            var box = this.getBoundingClientRect();
            if (y < box.top + box.height / 2) {
                result = this;
            }
        });
        return result;
    }

    function setupSortable() {
        rows().each(function () {
            setupRow(this);
        });

        if ($group.data('dfdSortable')) {
            return;
        }
        $group.data('dfdSortable', true);

        var dragEl = null;

        $group.on('dragstart', ITEM_SEL, function (event) {
            dragEl = this;
            this.classList.add(DRAGGING_CLASS);
            var dt = event.originalEvent.dataTransfer;
            if (dt) {
                dt.effectAllowed = 'move';
                dt.setData('text/plain', ''); // Firefox needs data to start a drag
            }
        });

        $group.on('dragend', ITEM_SEL, function () {
            if (!dragEl) {
                return;
            }
            dragEl.classList.remove(DRAGGING_CLASS);
            dragEl.draggable = false;
            dragEl = null;
            renumber();
        });

        $group.on('dragover', function (event) {
            if (!dragEl) {
                return;
            }
            event.preventDefault();
            if (event.originalEvent.dataTransfer) {
                event.originalEvent.dataTransfer.dropEffect = 'move';
            }

            var parent = dragEl.parentNode;
            var after = dragAfterElement(event.originalEvent.clientY);
            if (!after) {
                // Past the last row: drop just before the hidden template
                // row (and thus before the "Add another" link).
                var emptyEl = $group.find('.empty-form').get(0);
                after = (emptyEl && emptyEl.parentNode === parent) ? emptyEl : null;
            }
            if (after !== dragEl && nextElement(dragEl) !== after) {
                parent.insertBefore(dragEl, after);
            }
        });
    }

    // --- Wire everything up ------------------------------------------------

    function init() {
        // Collapse each inline as a whole, toggled from its <h3> header.
        makeCollapsible($group, ITEM_SEL, 'fieldset', 'h3 b');
        // Collapse individual fieldsets within each inline, from their <h4>;
        // keep the first ("Basic") fieldset open by default.
        rows().each(function () {
            makeCollapsible($(this), 'fieldset', '.form-row', 'h4', null, true);
        });
        initRename();
        initPrepopulateLabel();
        setupSortable();
    }

    init();

    // Re-initialise rows that Django adds via "Add another".
    document.addEventListener('formset:added', function (event) {
        if (event.detail && event.detail.formsetName !== 'formdefinitionfield_set') {
            return;
        }
        init();
        // Expand the row that was just added so it can be filled in straight
        // away (its "Basic" fieldset is open by default).
        var toggle = $(event.target).data('dfdToggle');
        if (toggle) {
            toggle(true);
        }
    });
});
