const VUE_TEMPLATE_FUNC_NAME = '$vue_templ';
let componentPathToTemplate = {};
let workFilesPaths = [];
let Interfaces = new function(){
    var counter = 1;
    let interfaceNameToId = {};
    this.add = function(name){
        if(interfaceNameToId[name] == null)
            return interfaceNameToId[name] = counter++;
    }
    this.getId = function(name){
        if(interfaceNameToId[name])
            return interfaceNameToId[name];
        return interfaceNameToId[name] = counter++;
    }
    this.getNameById = function(id){
        return Object.keys(interfaceNameToId).find(key => interfaceNameToId[key] === id);
    }
    this.getMask = function(interfaces){
        let mask = [];
        for(let interface of interfaces)
            if(interfaceNameToId[interface])
                mask.push(interfaceNameToId[interface])
        return mask;
    }
}
let entryPointClassPath;
function Plastique(options){
    let OUTPUT_DIR = options.outputDir; //__dirname + "/target";
    const VUE_TEMPLATES_DIR = options.vueTemplatesDir || 'templates';
    const VUE_TEMPLATES_JS_FILE_NAME = options.vueTemplatesOutputFileName || 'templates';
    const I18N_DIR = options.i18nDir || 'i18n';
    const I18N_JS_FILE_NAME = options.i18nOutputFileName || 'app.locale';

    //---------------------------------------------------------------------------------------------------------------------

    const VUE_SCRIPT_DIALECT_URL = 'http://github.com/codeplastique/plastique';


    // const APP_CLASS_NAME = 'App';
    const ANNOTATION_REACTIVE_CLASS = 'Reactive';
    // const ANNOTATION_TEMPLATE = 'Template';
    const ANNOTATION_ENTRY_POINT_CLASS = 'EntryPoint';
    // const ANNOTATION_REACTIVE_FIELD = 'Reactive';
    // const ANNOTATION_CACHED_METHOD = 'Cached';
    const ANNOTATION_AUTOWIRED = 'Autowired';
    const ANNOTATION_ONCHANGE = 'OnChange';
    const ANNOTATION_BEAN = 'Bean';
    const ANNOTATION_BEANS = 'Beans';
    const ANNOTATION_LISTENER = 'Listener';
    const ANNOTATION_AFTERATTACH = 'AfterAttach';
    const ANNOTATION_BEFOREDETACH = 'BeforeDetach';
    const ANNOTATION_ELEMENT = 'Inject';
    const ANNOTATION_INIT_EVENT = 'InitEvent';
    const ANNOTATION_INIT_VIRTUAL_COMPONENT = 'InitMarker';
    const ANNOTATION_TO_JSON = 'ToJson';
    const ANNOTATION_JSON_MERGE = 'JsonMerge';
    const ANNOTATION_ENUM = 'Enum';
    const ANNOTATION_REQUEST_MAPPING = 'RequestMapping';

    const COMPONENT_INTERFACE_NAME = 'Component';
    const EVENTMANAGER_CLASS_NAME = 'Eventer';
    const VIRTUAL_COMPONENT_CLASS_NAME = 'Marker';
    const APP_EVENT_TYPE = 'AppEvent';
    const I18N_METHOD = '_app.i18n';
    const TYPE_CLASS_NAME = 'Type';
    const TYPE_CLASS_PATH = '/plastique/base/Type.ts';
    const COMPONENT_INTERFACE_PATH = '/plastique/component/Component.ts';
    const ENTRYPOINT_ANNOTATION_PATH = '/plastique/base/EntryPoint.ts';
    const VIRTUAL_COMPONENT_ANNOTATION_PATH = '/plastique/component/Marker.ts';
    const CLASSAPPEND_COMPONENT_SPECIAL_PROPERTY = 'clazz$';
    const ENUM_ANNOTATION_PATH = '/plastique/enum/Enum.ts';
    const ENUMERABLE_CLASS = 'Enumerable';
    const ENUMERABLE_IDENTIFIER = 'plastique/enum/Enumerable';

    // --------------------------------------------------------------------------------------------------------------------

    var glob = require('glob');
    var fs = require('fs');
    // const pug = require('pug'); "2.0.4"
    const vueCompiler = require('vue-template-compiler');
    const { JSDOM } = require('jsdom');
    const ts = require("typescript");
    const PropertiesReader = require('properties-reader');
    const Template = require('./src/template/ExpressionTransformator');
    // const mkdirp = require('mkdirp'); "0.5.1
    Array.prototype.flatMap = function(f) {
        return this.map(f).reduce((x,y) => x.concat(y), [])
    }

    function isImplementsInterface(context, node, interfaceName, deep){
        if(node == null)
            return;
        interfaceName = interfaceName.toLowerCase();
        let typeInterfaces;
        if(node.kind == ts.SyntaxKind.ClassDeclaration)
            typeInterfaces = ts.getClassImplementsHeritageClauseElements(node);
        else{ //node is interface
            if(node.heritageClauses && node.heritageClauses[0] && node.heritageClauses[0].types)
                typeInterfaces = node.heritageClauses[0].types
        }

        let interfaces = (typeInterfaces || []).map(t => t.expression.escapedText.toLowerCase());
        let isImplements = interfaces.includes(interfaceName);
        if(isImplements)
            return isImplements;
        if(deep){
            for(let interface of interfaces){
                if(isImplementsInterface(
                    context,
                    getClass(node, interface, context),
                    interfaceName,
                    true
                ))
                    return true;
            }
            if(isImplementsInterface(
                context,
                getParentClass(node, context),
                interfaceName,
                true
            ))
                return true;
        }
    }

    function getInterfacesDeep(node, context){
        let typeInterfaces = [];
        if(node.kind == ts.SyntaxKind.ClassDeclaration)
            typeInterfaces = ts.getClassImplementsHeritageClauseElements(node);
        else{ //node is interface
            if(node.heritageClauses && node.heritageClauses[0] && node.heritageClauses[0].types)
                typeInterfaces = node.heritageClauses[0].types
        }
        let paths = [];
        for(let interface of (typeInterfaces || [])){
            let interfaceName = interface.expression.escapedText;
            let path = getNodePath(node, interfaceName);
            let interfaceNode = getClassByPath(path, interfaceName, context);
            if(interfaceNode && interfaceNode.kind == ts.SyntaxKind.InterfaceDeclaration){
                paths.push(path);
                paths.push.apply(paths, getInterfacesDeep(interfaceNode, context));
            }
        }
        return paths;
    }

    function getParents(classNode, context) {
        let parents = (ts.getClassImplementsHeritageClauseElements(classNode) || []).map(t => getNodePath(classNode, t.expression.escapedText))
        parents.push.apply(parents, getInterfacesDeep(classNode, context))
        // let parentClass = ts.getClassExtendsHeritageElement(classNode);
        // if(parentClass)
            // parents.push(getNodePath(classNode, parentClass.expression.escapedText))
        return Array.from(new Set(parents).values());
    }

    function isNodeHasDecorator(nodeClass, decoratorName){
        let decorators = nodeClass.decorators != null? nodeClass.decorators: [];
        return decorators.map(d => {
            let expr = d.expression;//.expression.escapedText
            return expr.expression? expr.expression.escapedText: expr.escapedText;
        }).includes(decoratorName);
    }
    function removeDecorator(nodeClass, decoratorName){
        let decorators = nodeClass.decorators != null? nodeClass.decorators: [];
        for(let i = 0; i < decorators.length; i++){
            let decorator = decorators[i];
            let expr = decorator.expression;//.expression.escapedText
            let dName = expr.expression? expr.expression.escapedText: expr.escapedText;
            if(dName == decoratorName){
                decorators.end = decorators.pos = -1;
                decorators.transformFlags = null;
                decorators.splice(i, 1);
                return;
            }
        }
        // if(decorators.length == 0)
        //     nodeClass.decorators = null;
    }

    function getDecoratorArguments(nodeClass, decoratorName, isArgRequired){
        let decorators = nodeClass.decorators != null? nodeClass.decorators: [];
        if(decorators.length > 0){
            for(let decorator of nodeClass.decorators){
                let expr = decorator.expression;//.expression.escapedText
                let name = expr.expression? expr.expression.escapedText: expr.escapedText;

                if(name == decoratorName){
                    if(decorator.expression.arguments && decorator.expression.arguments.length > 0){
                        return decorator.expression.arguments;
                    }
                    if(isArgRequired)
                        console.error('Decorator "'+ decoratorName +'" has no arguments!');
                }
            }
        }
        return null;
    }

    function getDecoratorArgumentMethodName(nodeClass, decoratorName, required){
        let args = getDecoratorArguments(nodeClass, decoratorName, required);
        if(args == null)
            return null;

        let text = args[0].text;
        return text? text: (args[0].name? args[0].name.escapedText: args[0].getFullText());
    }

    function getDecoratorArgumentCallExpr(nodeClass, decoratorName, required){
        let args = getDecoratorArguments(nodeClass, decoratorName, required);
        if(args == null)
            return null;
        let arg = args[0];
        let isCompositeName = arg.expression.expression != null;
        return [
            (isCompositeName? arg.expression.expression.escapedText: arg.expression.escapedText),
            (isCompositeName? (arg.expression.name.escapedText +'.'): '') + arg.name.escapedText
        ]
    }

    function getFileNameWithoutExt(filePath){
        var nameArray = filePath.split('/');
        return nameArray[nameArray.length - 1].split('.').slice(0, -1)[0]
    }

    function getVueTemplateRender(vueTemplate, componentNode){
        const componentName = componentNode.name.escapedText;
        let dom = new JSDOM('<html><body><template>'+ vueTemplate +'</template></body></html>');
        var rootTag = dom.window.document.body.firstElementChild.content;
        let elems = rootTag.querySelectorAll('*');
        if(rootTag.children.length > 1)
            console.error('Component '+ componentName +' has multiple root tags!')
        let rootComponent = rootTag.children[0];
    
        let prefixAttr = Array.from(rootComponent.attributes)
                .find(a => a.name.startsWith('xmlns:') && a.value == VUE_SCRIPT_DIALECT_URL);
        let prefixAttrName = prefixAttr? prefixAttr.name: null;

        let prefix;
        if(prefixAttrName){
            rootComponent.removeAttribute(prefixAttrName);
            prefix = prefixAttrName.substr(6)
        }
        rootComponent.setAttribute('data-cn', componentName)
        if(handle(prefix, elems, componentName)){


            function replaceSpecialTag(tagName, tag){
                tag.insertAdjacentHTML('beforebegin',`<${tagName}>${tag.innerHTML}</${tagName}>`);
                let specialTag = tag.previousSibling;
                for(attr of tag.attributes)
                    specialTag.setAttribute(attr.name, attr.value);
                tag.remove();
                return specialTag;
            }

            function replaceAnimationElems(root){
                if(root.children == null)
                    return;
                    
                let attrName = prefix +':animation';
                for(let child of root.children){
                    if(child.hasAttribute(attrName)){
                        let val = child.getAttribute(attrName);
                        child.removeAttribute(attrName);
                        let isAnimString = val.trim().match(/^'.+'$/) != null;
                        let transitionAttr = isAnimString? 
                            `name="${val.trim().slice(1, -1)}"`
                            : 
                            `v-bind:name="${extractExpression(val)}"`;

                        child.insertAdjacentHTML('beforebegin',`<transition ${transitionAttr}>${child.outerHTML}</transition>`);
                        let newTag = child.previousSibling;
                        child.remove();
                        child = newTag; 
                    }
                    replaceAnimationElems(child);
                }
            }

            function replaceTagElems(replaceFilterAction, raplaceTagName, newTagTransform, root){
                if(root == null)
                    root = rootComponent;
                if(root.children == null)
                    return;
                    
                if(root.tagName == 'TEMPLATE')
                    root = root.content
                for(let child of root.children){
                    if(replaceFilterAction(child)){
                        child.insertAdjacentHTML('beforebegin',`<${raplaceTagName}>${child.innerHTML}</${raplaceTagName}>`);
                        let newTag = child.previousSibling;

                        for(let attr of child.attributes)
                            newTag.setAttribute(attr.name, attr.value);

                        if(newTagTransform)
                            newTagTransform(newTag)

                        child.remove();
                        child = newTag; 
                    }
                    replaceTagElems(replaceFilterAction, raplaceTagName, newTagTransform, child);
                }
            }

            function replaceComponentElems(elems){
                for(let elem of elems){
                    let componentAttr = Array.from(elem.attributes).find(a => a.name.startsWith(prefix+ ':component'));
                    if(componentAttr){
                        let componentExpr = extractExpression(componentAttr.value);
                        elem.removeAttribute(componentAttr.name)
                        let cloneComponent = replaceSpecialTag('component', elem);
                        if(cloneComponent.hasChildNodes()){
                            replaceComponentElems(cloneComponent.querySelectorAll('*'))
                        }

                        // let [componentCast] = getModifiers(componentAttr.name);

                        let componentVar;
                        let componentName;
                        if(componentExpr.includes(' as ')){
                            componentName = componentExpr.replace(/([\w\d]+)\s+as\s+([\w\d]+)/g, (_, varName, cast) => {
                                if(componentVar && componentVar != varName)
                                    throw new Error(`Invalid casting in ${componentAttr.value}`)
                                componentVar = varName;
                                return `'${cast.toUpperCase()}'`
                            })

                            let regexp = new RegExp(`(?<=[?:]\\s*)${componentVar}`, 'g');
                            componentName = componentName.replace(regexp, componentVar + '.app$.cn')

                        }else{
                            componentVar = componentExpr;
                            componentName = componentVar + '.app$.cn';
                        }

                        // let componentVar = componentExpr;
                        // let componentName = componentVar + '.app$.cn';
                        // componentVar.replace(/([\w\d]+)\s+as\s+([\w\d]+)/g, (a, b, c) => `'${c.toUpperCase()}'`)
                        
                        // let componentName = componentCast != null? `'${componentCast.toUpperCase()}'`: (componentVar + '.app$.cn');
                        cloneComponent.setAttribute(':is', componentName);
                        cloneComponent.setAttribute(':key', componentVar +'.app$.id');
                        cloneComponent.setAttribute('v-bind:m', `$convComp(${componentVar})`);

                        let classAppendAttr = cloneComponent.getAttribute('v-bind:class');
                        if(classAppendAttr){
                            cloneComponent.setAttribute('v-bind:c', classAppendAttr);
                            cloneComponent.removeAttribute('v-bind:class')
                        }
                    }
                }
            }
            
            if(prefix){
                let arrayElems = Array.from(elems);
                let slotElems = arrayElems.filter(t => t.tagName.startsWith(prefix.toUpperCase() +':SLOT'))
                if(slotElems.length > 0){
                    slotElems.map(t => {
                            let slotName = getModifiers(t.tagName)[0]
                            if(slotName)
                                t.setAttribute('v-bind:name', slotName)
                            return t;
                        })
                        .forEach(t => replaceSpecialTag('slot', t));
                    arrayElems = Array.from(rootTag.querySelectorAll('*'))
                }

                // let templatesElems = arrayElems.filter(t => t.hasAttribute('v-hasSlot')).map(t => {
                //     t.removeAttribute('v-hasSlot');
                //     return t;
                // }).filter(t => t.tagName != (prefix.toUpperCase() +':BLOCK'));
                // if(templatesElems.length > 0){
                //     templatesElems.forEach(t => replaceSpecialTag(prefix.toUpperCase() +':block', t));
                    // arrayElems = Array.from(rootTag.querySelectorAll('*'))
                replaceTagElems(tag => tag.hasAttribute('v-hasSlot'), (prefix +':block'), tag => tag.removeAttribute('v-hasSlot'))
                // }

                replaceAnimationElems(rootComponent);
                
                arrayElems = Array.from(rootTag.querySelectorAll('*'))
                replaceComponentElems(arrayElems);

                // arrayElems = Array.from(rootTag.querySelectorAll('*'))
                // arrayElems.filter(e => e.tagName == (prefix.toUpperCase() +':BLOCK'))
                //     .forEach(t => replaceSpecialTag('template', t));
                
                replaceTagElems(tag => tag.tagName == (prefix.toUpperCase() +':BLOCK'), 'template')
            }

            let classAppendAttr = rootComponent.getAttribute('v-bind:class');
            let classPrefix = classAppendAttr? `(${classAppendAttr})+' '+`: ''
            rootComponent.setAttribute('v-bind:class', classPrefix + CLASSAPPEND_COMPONENT_SPECIAL_PROPERTY);
            
            let completeVueTemplate = rootTag.firstElementChild.outerHTML.replace(/___:([a-zA-Z\d]+?)___:/g, 'v-on:[$1]').replace(/__:([a-zA-Z\d]+?)__:/g, 'v-bind:[$1]');
            let vueCompilerResult = vueCompiler.compile(completeVueTemplate);
            if(vueCompilerResult.errors.length != 0)
                throw new Error(`Vue compile error! Template ${componentName}. ` + vueCompilerResult.errors);
            let staticRenders = [];
            for(let staticRender of vueCompilerResult.staticRenderFns){
                staticRenders.push(`function(){${staticRender}}`);
            }
            return {
                template: `{r:function(){${vueCompilerResult.render}},s:[${staticRenders.join(',')}]}`
            };
        }else
            return null;


    }

    // function buildTemplates(){
    //     const templatesFunctions = [];
    //     glob(VUE_TEMPLATES_DIR +'/**/*.@(pug|html)', {sync: true}).forEach(function(element) {
    //         let componentName = getFileNameWithoutExt(element);
    //         var vueTemplate = element.endsWith('.pug')? pug.compileFile(element)(): fs.readFileSync(element, 'utf8');
    //         let render = getVueTemplateRender(vueTemplate, componentName);
    //         if(render){
    //             templatesFunctions.push(`"${componentName.toUpperCase()}":${render.template}`);
    //         }
    //     });
    //     if(templatesFunctions.length > 0){
    //         let vueTempaltesObject = 'var _VueTemplates={' + (templatesFunctions.join(',')) + '};';
    //         if (!fs.existsSync(OUTPUT_DIR)) {
    //             mkdirp.sync(OUTPUT_DIR);
    //         }
    //         fs.writeFileSync(OUTPUT_DIR +'/'+ VUE_TEMPLATES_JS_FILE_NAME + '.js', vueTempaltesObject);
    //     }
    // }

    function buildLocales(){
        let langToPropertiesReader = {};
        let regexp = new RegExp('"([^(\")"]+)":', 'g');
        glob(I18N_DIR +'/**/*.properties', {sync: true}).forEach(function(filePath) {
            let fileName = getFileNameWithoutExt(filePath);
            let [bundle, locale] = fileName.split('_');
            if(langToPropertiesReader[locale] == null)
                langToPropertiesReader[locale] = new PropertiesReader();
            langToPropertiesReader[locale].append(filePath);
        });
        for(let locale in langToPropertiesReader){
            let i18nObj = JSON.stringify(langToPropertiesReader[locale]._properties).replace(regexp,"$1:");
            let localeFileString = 'var _AppLocale={locale:"'+ locale +'",values:'+ i18nObj +'};';
            if (!fs.existsSync(OUTPUT_DIR)) {
                fs.mkdirSync(OUTPUT_DIR, {recursive: true});
            }
            fs.writeFileSync(OUTPUT_DIR +'/'+ I18N_JS_FILE_NAME + '_' + locale +'.js', localeFileString);
        }
    }

    // buildTemplates();
    buildLocales();

    let beanToId = {};
    let beanCounter = 0;
    beanToId[EVENTMANAGER_CLASS_NAME] = beanCounter++; 
    let entryPointsNames = [];
    let componentsNames = [];
    let eventToIdentifier = [];

    function getOrCreateConstructor(classNode){
        for(let member of classNode.members)
            if(member.kind == ts.SyntaxKind.Constructor)
                return member;
        let constructorNode = ts.createConstructor(null, null, null, ts.createBlock([]));
        classNode.members.push(constructorNode);
        if(ts.getClassExtendsHeritageElement(classNode) != null)
            constructorNode.body.statements.push(ts.createExpressionStatement(ts.createCall(ts.createSuper())));
        return constructorNode;
    }

    function cleanMemberCache(memberNode){
        memberNode.end = memberNode.pos = -1;
        memberNode.flags = 8;
        memberNode.modifierFlagsCache = memberNode.transformFlags = null;
    }

    function getNodePath(node, className){
        if(node.kind == ts.SyntaxKind.ClassDeclaration && node.name.escapedText == className)
            return node.getSourceFile().fileName;

        let d = node.getSourceFile()
            .locals
            .get(className? className: node.expression.escapedText);

        if(d == null)
            return;
        let f =  d.declarations[0].parent;

        if(f.fileName)
            return f.fileName;

        let relativeModulePath = f
            .moduleSpecifier
            .text
            
        let module = node.getSourceFile().resolvedModules.get(relativeModulePath);
        if(module == null){
            throw new Error(`${relativeModulePath} is not found in ${node.getSourceFile().fileName}`)
        }

        return module.resolvedFileName
    }

    function getClass(currentNode, className, context){
        return getClassByPath(getNodePath(currentNode, className), className, context);
    }

    function getClassByPath(classPath, className, context){
        if(classPath != null){
            let module = context.getEmitHost().getSourceFile(classPath);
            for(let node of module.statements)
                if((node.kind === ts.SyntaxKind.ClassDeclaration || node.kind == ts.SyntaxKind.InterfaceDeclaration) && node.name.escapedText == className)
                    return node;
        }
    }

    function getParentClassName(classNode) {
        let parent = ts.getClassExtendsHeritageElement(classNode);
        if(parent == null)
            return;
        return parent.expression.escapedText;
    }

    function getParentClass(classNode, context){
        let parentClassName = getParentClassName(classNode);
        if(parentClassName == null)
            return;
        return getClass(classNode, parentClassName, context);
    }

    function getAllRootComponentsData(componentNode, context){
        let className = componentNode.name.escapedText;
        let maxParents = 0;
        let members = [];
        let attachHook = null;
        let detachHook = null;
        while(componentNode = getParentClass(componentNode, context)){
            if(componentNode.members){
                members = members.concat(componentNode.members
                    .filter(m => m.kind == ts.SyntaxKind.PropertyDeclaration)
                    .map(m => m.name.escapedText)
                )
                for(let member of componentNode.members){
                    if(member.kind == ts.SyntaxKind.MethodDeclaration){
                        let methodName = member.name.escapedText;
                        if(!attachHook && isNodeHasDecorator(member, ANNOTATION_AFTERATTACH)){
                            attachHook = methodName;
                        }
                        if(!detachHook && isNodeHasDecorator(member, ANNOTATION_BEFOREDETACH)){
                            detachHook = methodName;
                        }
                    }
                }
            }
            if(++maxParents > 100)
                throw new Error('More than 100 parents on '+ className);
        }
        return {
            members: members,
            attachHook: attachHook,
            detachHook: detachHook
            // onChangeMethods: {}
        }
    }

    function hasPropertyAssignmentInConstructor(constructorNode, member){
        let memberName = member.name.escapedText;
        for(let node of constructorNode.body.statements){
            if(node.kind == ts.SyntaxKind.ExpressionStatement
                && node.expression.kind == ts.SyntaxKind.BinaryExpression
                && node.expression.operatorToken.kind == ts.SyntaxKind.FirstAssignment
                && node.expression.left.kind == ts.SyntaxKind.PropertyAccessExpression
                && node.expression.left.name.escapedText == memberName
            )
                return true;
        }
    }

    function getSuperNode(constructorNode){
        return constructorNode.body.statements.filter(s =>
            (s.kind == ts.SyntaxKind.ExpressionStatement)
            && (s.expression.kind == ts.SyntaxKind.CallExpression)
            && (s.expression.expression.kind == ts.SyntaxKind.SuperKeyword))[0]
    }

    function getComponentTemplate(componentNode) {
        
        let reactiveArgs = getDecoratorArguments(componentNode, ANNOTATION_REACTIVE_CLASS);
        let templateArg = reactiveArgs? reactiveArgs[0]: null;
        if(templateArg){
            if(templateArg.kind == ts.SyntaxKind.ArrowFunction || templateArg.kind == ts.SyntaxKind.FunctionExpression){
                let statement = templateArg.body.statements.find(
                    (s.kind == ts.SyntaxKind.ExpressionStatement || s.kind == ts.SyntaxKind.ReturnStatement) && s.expression.kind == ts.SyntaxKind.TemplateExpression
                    );
                templateArg = statement? statement.expression: null;
                if(templateArg == null)
                    throw new Error('Template is not found! Component: '+ componentNode.name.escapedText)
            }else if(templateArg.kind != ts.SyntaxKind.TemplateExpression && templateArg.kind != ts.SyntaxKind.FirstTemplateToken){
                throw new Error('Template is not valid type! StringTemplate is required! Component: '+ componentNode.name.escapedText)
            }
            return templateArg.getFullText().slice(1, -1);// remove quote(`) chars
        }
    }

    let VirtualComponents = new function() {
        let virtualComponentToId = {};
        let counter = 0;
        this.isVirtualComponentName = function(virtualComponentName, currentNode){
            if(virtualComponentName.startsWith('this.'))
                return false;
            let parts = virtualComponentName.split('.');
            if(parts < 2)
                return false;
            let neededClassName = parts[0];
            let neededClassPath = getNodePath(currentNode, neededClassName);
            return virtualComponentToId[neededClassPath + '.'+ virtualComponentName] != null
        }
        this.getId = function(virtualComponentName, currentNode){
            let neededClassName = virtualComponentName.split('.')[0];
            let neededClassPath = getNodePath(currentNode, neededClassName);
            let virtualComponentPath = neededClassPath + '.'+ virtualComponentName;
            if(virtualComponentToId[virtualComponentPath] == null)
                return virtualComponentToId[virtualComponentPath] = 'vc' + (counter++);
            else 
                return virtualComponentToId[virtualComponentPath];
        }    
    }

    const MemberInitializator = new function(){
        let memberToInitializer = new Map;
        function getInitializer(memberPathName, member, requiredType, idProducer, classNode){
            let isCompositeMember = member.type.kind == ts.SyntaxKind.TypeLiteral;
            if(!isCompositeMember){
                if(member.type.typeName && member.type.typeName.escapedText == requiredType){
                    let id = idProducer.getId(memberPathName, classNode);
                    return ts.createStringLiteral(String(id));
                }else
                    throw new Error(`Member "${memberPathName} must have the ${requiredType} type`);
            }else{
                let properies = [];
                let memberParts = member.type.members;
                for(let memberPart of memberParts){
                    let fullMemberPartName = memberPathName + '.'+ memberPart.name.escapedText;
                    properies.push(ts.createPropertyAssignment(
                        memberPart.name.escapedText, 
                        getInitializer(fullMemberPartName, memberPart, requiredType, idProducer, classNode)
                    ));
                }
                return ts.createObjectLiteral(properies);
            }
        }
        this.initialize = function(classNode, member, requiredType, idProducer) {
            let className = classNode.name.escapedText;
            let memberName = className +'.'+ member.name.escapedText;
            memberToInitializer.set(member, getInitializer(memberName, member, requiredType, idProducer, classNode));
        }
        this.getInitializer = function(member){
            return memberToInitializer.get(member)
        }
    }

    function configureComponent(componentNode, context){
        let componentName = componentNode.name.escapedText;
        let template = getComponentTemplate(componentNode);
        let componentRoot = getAllRootComponentsData(componentNode, context);
        // let parent = getParentClass(componentNode, context);
        // if(parent)
        // configureComponent(parent);

        let onchangeMethods = {};
        let elementProps = [];
        let attachHook = null;
        let detachHook = null;
        let constructorNode = getOrCreateConstructor(componentNode);
        if(isEntryPointNode(componentNode)){
            let superStatement = getSuperNode(constructorNode);
            let elementArgument = superStatement.expression.arguments.shift();

            constructorNode.body.statements.push(
                ts.createExpressionStatement(
                    ts.createCall(
                        ts.createPropertyAccess(
                            ts.createThis(),
                            "attachComponent"),
                        null,
                        [elementArgument, ts.createThis()]
                    )
                )
            )
        }
        if(componentNode.members){
            for(let member of componentNode.members){
                if(member.kind == ts.SyntaxKind.PropertyDeclaration){
                    let memberName = member.name.escapedText;

                    let isVirtualComponent = isNodeHasDecorator(member, ANNOTATION_INIT_VIRTUAL_COMPONENT);
                    if(isVirtualComponent){
                        removeDecorator(member, ANNOTATION_INIT_VIRTUAL_COMPONENT);
                        member.initializer = MemberInitializator.getInitializer(member)
                    }

                    let isElementProp = isNodeHasDecorator(member, ANNOTATION_ELEMENT);
                    if(isElementProp){
                        elementProps.push(memberName);
                        removeDecorator(member, ANNOTATION_ELEMENT);
                    }else{
                        if(member.initializer == null
                            && !componentRoot.members.includes(memberName)
                            && !hasPropertyAssignmentInConstructor(constructorNode, member)
                        ){
                            member.initializer = ts.createNull();
                        }
                    }
                    let methodName = getDecoratorArgumentMethodName(member, ANNOTATION_ONCHANGE, true);
                    if(methodName != null){
                        onchangeMethods[member.name.escapedText] = methodName;
                        removeDecorator(member, ANNOTATION_ONCHANGE);
                    }
                }else if(member.kind == ts.SyntaxKind.MethodDeclaration){
                    let methodName = member.name.escapedText;
                    if(!attachHook && isNodeHasDecorator(member, ANNOTATION_AFTERATTACH)){
                        attachHook = methodName;
                        if(componentRoot.attachHook){
                            member.body.statements.unshift(
                                ts.createExpressionStatement(ts.createCall(ts.createPropertyAccess(ts.createSuper(), ts.createIdentifier(componentRoot.attachHook))))
                            );
                        }
                        removeDecorator(member, ANNOTATION_AFTERATTACH);
                    }
                    if(!detachHook && isNodeHasDecorator(member, ANNOTATION_BEFOREDETACH)){
                        detachHook = methodName;
                        if(componentRoot.detachHook){
                            member.body.statements.unshift(
                                ts.createExpressionStatement(ts.createCall(ts.createPropertyAccess(ts.createSuper(), ts.createIdentifier(componentRoot.detachHook))))
                            );
                        }
                        removeDecorator(member, ANNOTATION_BEFOREDETACH);
                    }
                }
            }
        }
        let configuration = {
            w: onchangeMethods, //onchange methods
            // c: [], //cached methods
            ep: elementProps //element properties
        };
        if(attachHook)
            configuration.ah = attachHook;
        else
            configuration.ah = componentRoot.attachHook
        if(detachHook)
            configuration.dh = detachHook;
        else
            configuration.dh = componentRoot.detachHook

        let renderObj
        if(template){
            // configuration.tn = templateName.toUpperCase();
            // let render = getVueTemplateRender(template, componentName);
            // renderObj = ts.createSourceFile("a", `alert(${render})`).statements[0].expression.arguments[0];
            renderObj = ts.createIdentifier(VUE_TEMPLATE_FUNC_NAME);
            let templateRender = getVueTemplateRender(template, componentNode);
            // for(let interfaceId of templateRender.virtualComponents){
            //     let interfaceName = Interfaces.getNameById(interfaceId);
            //     if(!isImplementsInterface(context, componentNode, interfaceName, true))
            //         throw new Error('Invalid template virtual component "Type<'+ interfaceName +'>". Component "'+ componentName + '" does not implement interface: '+ interfaceName);
            // }
            componentPathToTemplate[componentNode.parent.fileName] = templateRender.template;
            // removeDecorator(componentNode, ANNOTATION_TEMPLATE)
        }

        let callExpr = (isStatic) => ts.createCall(
            ts.createPropertyAccess(
                ts.createIdentifier(isStatic? '_super': '_app'),
                ts.createIdentifier(isStatic? 'initComponent': 'initComp')
            ),
            undefined, // type arguments, e.g. Foo<T>()
            [
                ts.createLiteral(componentName.toUpperCase()),
                ts.createLiteral(JSON.stringify(configuration)),
                ts.createThis(),
                renderObj == null? ts.createNull(): renderObj
            ]
        );
        if(isEntryPointNode(componentNode))
            constructorNode.body.statements.unshift(callExpr(true));
        else
            constructorNode.body.statements.push(callExpr(false));

        removeDecorator(componentNode, ANNOTATION_REACTIVE_CLASS)
        componentsNames.push(componentName);
    }

    function getBeansDeclarations(beanClass, beansOfEntryPoint){
        let beansDeclarations = {};
        for(let member of beanClass.members){
            if(member.kind == ts.SyntaxKind.MethodDeclaration && isNodeHasDecorator(member, ANNOTATION_BEAN)){
                if(member.type.typeName == null)
                    throw new Error('Method '+ member.name.escapedText +' is not typed!')
                if(member.parameters && member.parameters.length != 0)
                    throw new Error('Method '+ member.name.escapedText +' should not have parameters')
                // beansDeclarations[member.type.typeName.escapedText] = member.name.escapedText;

                let typeName = member.type.typeName.escapedText

                let beanId = beanToId[typeName];
                if(beanId === undefined){
                    beanId = beanCounter;
                    beanToId[typeName] = beanCounter;
                    beanCounter++;
                    if(beansOfEntryPoint)
                        beansOfEntryPoint.push(typeName);
                }else if(beansOfEntryPoint && beansOfEntryPoint.includes(typeName)){
                    throw new Error(`Bean with type ${typeName} is initialized twice!`)
                }
                beansDeclarations[beanId +';'+ typeName] = member.name.escapedText;
                removeDecorator(member, ANNOTATION_BEAN);
                cleanMemberCache(member);
            }
        }
        return beansDeclarations;
    }


    function checkStringParameters(parameters, methodName){
        let illegalParam = parameters.find(p => (p.type == null) || (p.kind == null) || (p.type.kind != ts.SyntaxKind.StringKeyword));
        if(illegalParam)
            throw new Error(`Parameter '${illegalParam.name.escapedText}' in request mapping method '${methodName}' must be a string!`);
    }


    function getMapperConfiguration(node){
        let mappers = [];
        if(node.members){
            for(let member of node.members){
                if(member.kind == ts.SyntaxKind.MethodDeclaration){
                    let patternArg = getDecoratorArguments(member, ANNOTATION_REQUEST_MAPPING, true);
                    if(patternArg != null){
                        patternArg = patternArg[0]; //first argument

                        let methodName = member.name.escapedText;
                        if(patternArg.kind == ts.SyntaxKind.RegularExpressionLiteral){
                            let pattern = patternArg.text;
                            checkStringParameters(member.parameters, methodName);
                            let methodParameters = member.parameters.map(p => p.name.escapedText);
                            let argsIndices = [];

                            if(methodParameters.length > 0){
                                let groupSearcher = /(?<!\\)\(/g;
                                let result;
                                let groupIndex = 1;
                                while ((result = groupSearcher.exec(pattern)) !== null) {
                                    let namedGroup = pattern.substr(result.index).match(/\(?<(.+?)>/)
                                    if(namedGroup && namedGroup.index == 2){
                                        let variableId = namedGroup[1];
                                        if(/^\w[\w\d]*$/.test(variableId) == false)
                                            throw new Error(`Named group "${variableId}" is not valid!`)
                                        
                                        if(methodParameters.includes(variableId)){
                                            let paramPos = methodParameters.indexOf(variableId);
                                            methodParameters.splice(paramPos, 1, void 0);
                                            argsIndices[paramPos] = ts.createNumericLiteral(String(groupIndex));
                                        }
                                    }

                                    groupIndex++;
                                }

                                let undefinedVariableId = methodParameters.find(p => p !== void 0);
                                if(undefinedVariableId)
                                    throw new Error(`Parameter '${undefinedVariableId}' is not found in the request method pattern (${memberName})!`)
                            }

                            pattern = pattern.replace(/(?<!\\)\(\?<.+?>/g, '('); //remove all named groups
                            let endOfRegexpPos = pattern.lastIndexOf('/');
                            pattern = pattern.substr(0, endOfRegexpPos) + pattern.substr(endOfRegexpPos).replace('g',''); //remove 'g' modifier

                            let isArgsIndecesConsistent = argsIndices.find((e, i) => (+e.text) != (i+1)) === void 0
                            if(argsIndices.length > 0 && !isArgsIndecesConsistent)
                                mappers.push(ts.createArrayLiteral([
                                    ts.createRegularExpressionLiteral(pattern),
                                    ts.createLiteral(methodName),
                                    ts.createArrayLiteral(argsIndices)
                                ]));
                            else
                                mappers.push(ts.createArrayLiteral([
                                    ts.createRegularExpressionLiteral(pattern),
                                    ts.createLiteral(methodName)
                                ]));
                        }else{
                            mappers.push(ts.createArrayLiteral([
                                ts.createLiteral(patternArg.text),
                                ts.createLiteral(methodName)
                            ]));
                        }

                        removeDecorator(member, ANNOTATION_REQUEST_MAPPING)
                    }
                }
            }
        }
        return mappers;
    }



    function configureEntryPointClass(entryPointNode, context){
        let entryPointClassName = entryPointNode.name.escapedText;
        let beansClassesBeans = [];
        let beansOfEntryPoint = [];

        let beansClassesArg = getDecoratorArguments(entryPointNode, ANNOTATION_BEANS, true);
        let beansClasses = beansClassesArg != null? beansClassesArg[0].elements: [];
        for(let beanClass of beansClasses){
            let beanClassName = beanClass.escapedText;
            beansClassesBeans.push(getBeansDeclarations(getClass(entryPointNode, beanClassName, context), beansOfEntryPoint));
        }

        beansClassesBeans.push(getBeansDeclarations(entryPointNode, beansOfEntryPoint));

        let configurator = {
            name: entryPointClassName,
            beans: beansClassesBeans
        }

        // $ = (window[class] = class, jsonConfiguration)
        entryPointNode.members.push(
            ts.createProperty(
                [],
                [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                ts.createIdentifier('$beans'),
                undefined,
                ts.createKeywordTypeNode(ts.SyntaxKind.ArrayLiteralExpression),
                ts.createArrayLiteral(beansClasses)
            )
        );
        entryPointNode.members.push(
            ts.createProperty(
                [],
                [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                ts.createIdentifier('$'),
                undefined,
                ts.createKeywordTypeNode(ts.SyntaxKind.StringLiteral),
                ts.createBinary(
                    ts.createBinary(
                        ts.createElementAccess(ts.createIdentifier('window'), ts.createLiteral(entryPointClassName)),
                        ts.SyntaxKind.FirstAssignment,
                        ts.createIdentifier(entryPointClassName)
                    ),
                    ts.SyntaxKind.CommaToken,
                    ts.createLiteral(JSON.stringify(configurator))
                )
            )
        );

        let routingMappers = getMapperConfiguration(entryPointNode)
        if(routingMappers.length > 0){
            entryPointNode.members.push(
                ts.createProperty(
                    [],
                    [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                    ts.createIdentifier('routing$'),
                    undefined,
                    ts.createKeywordTypeNode(ts.SyntaxKind.ArrayLiteralExpression),
                    ts.createArrayLiteral(routingMappers)
                )
            );

            getOrCreateConstructor(entryPointNode).body.statements.push(ts.createCall(
                ts.createPropertyAccess(
                    ts.createIdentifier('_app'),
                    ts.createIdentifier('routing')
                ),
                undefined, // type arguments, e.g. Foo<T>()
                [
                    ts.createArrayLiteral(
                        [ts.createThis()]
                    )
                ]
            ));
        }

        entryPointsNames.push(entryPointNode.name.escapedText);
        removeDecorator(entryPointNode, ANNOTATION_BEANS)
        removeDecorator(entryPointNode, ANNOTATION_ENTRY_POINT_CLASS)
    }

    function isComponentNode(classNode){
        let className = classNode.name.escapedText;
        return componentsNames.includes(className) || isNodeHasDecorator(classNode, ANNOTATION_REACTIVE_CLASS);
    }

    function isEntryPointNode(classNode){
        let className = classNode.name.escapedText;
        return entryPointsNames.includes(className) || isNodeHasDecorator(classNode, ANNOTATION_ENTRY_POINT_CLASS);
    }

    function getBeanId(beanName){
        if(entryPointsNames.includes(beanName))
            return -1;
        let beanId = beanToId[beanName];
        if(beanId === undefined)
            throw new Error('Bean '+ beanName +' is not initialized!')
        return beanId;
    }

    function injectAutowired(classNode){
        // tryBindListeners(classNode);

        for(let member of classNode.members){
            if(isNodeHasDecorator(member, ANNOTATION_AUTOWIRED)){
                if(member.type.typeName == null)
                    throw new Error('Field '+ member.name.escapedText +' is not typed!')
                member.initializer =  ts.createCall(
                    ts.createPropertyAccess(
                        ts.createIdentifier('_app'),
                        ts.createIdentifier('bean')
                    ),
                    undefined, // type arguments, e.g. Foo<T>()
                    [
                        ts.createLiteral(getBeanId(member.type.typeName.escapedText)),
                    ]
                );
                if(member.type.typeName.escapedText == EVENTMANAGER_CLASS_NAME) {
                    member.initializer.arguments.push(ts.createThis());
                }
                removeDecorator(member, ANNOTATION_AUTOWIRED)
            }
        }
    }

    // function injectAutowiredEverywhere(rootNode, context){
    //     ts.visitEachChild(rootNode, (node) => {
    //         if (node.kind === ts.SyntaxKind.ClassDeclaration && node.members) {
    //             tryBindListeners(node);

    //             for(let member of node.members){
    //                 if(isNodeHasDecorator(member, ANNOTATION_AUTOWIRED)){
    //                     if(member.type.typeName == null)
    //                         console.error('Field '+ member.name.escapedText +' is not typed!')
    //                     member.initializer =  ts.createCall(
    //                         ts.createPropertyAccess(
    //                             ts.createIdentifier('_app'),
    //                             ts.createIdentifier('bean')
    //                         ),
    //                         undefined, // type arguments, e.g. Foo<T>()
    //                         [
    //                             ts.createLiteral(getBeanId(member.type.typeName.escapedText)),
    //                         ]
    //                     );
    //                     if(member.type.typeName.escapedText == EVENTMANAGER_CLASS_NAME) {
    //                         member.initializer.arguments.push(ts.createThis());
    //                     }
    //                     removeDecorator(member, ANNOTATION_AUTOWIRED)
    //                 }
    //             }
    //         }
    //     }, context)
    // }


    function tryBindListeners(classNode){
        if (classNode.members) {
            let methodToEvent = {};
            let hasListeners;
            for(let member of classNode.members){
                if(isNodeHasDecorator(member, ANNOTATION_LISTENER)){
                    hasListeners = true;
                    let [className, propName] = getDecoratorArgumentCallExpr(member, ANNOTATION_LISTENER, true);
                    let path = getNodePath(classNode, className);
                    let index = eventToIdentifier.findIndex(o => o.classFile == path && o.className == className && o.memberName == propName);
                    if(index == null || index < 0)
                        index = eventToIdentifier.push({
                            classFile: path,
                            className: className,
                            memberName: propName,
                            init: false
                        }) - 1;

                    methodToEvent[member.name.escapedText] = String(index);
                    removeDecorator(member, ANNOTATION_LISTENER);
                }
            }

            if(hasListeners){
                let callExpr = (isStatic) => ts.createCall(
                    ts.createPropertyAccess(
                        ts.createIdentifier(isStatic? '_super': '_app'),
                        ts.createIdentifier(isStatic? 'addListeners': 'listeners')
                    ),
                    undefined, // type arguments, e.g. Foo<T>()
                    [
                        ts.createLiteral(JSON.stringify(methodToEvent)),
                        ts.createThis()
                    ]
                );
                if(isEntryPointNode(classNode))
                    getOrCreateConstructor(classNode).body.statements.splice(1, 0, callExpr(true)); // first is init component
                else
                    getOrCreateConstructor(classNode).body.statements.push(callExpr(false));
            }
        }
    }


    function initInterfacesDef(classNode, context) {
        let interfaceMask = Interfaces.getMask(getParents(classNode, context));
        if(interfaceMask.length > 0){
            // getOrCreateConstructor(classNode).body.statements.unshift(callExpr(true));
            // let initInterfacesCall = ts.createCall(
            //     ts.createPropertyAccess(
            //         ts.createIdentifier('_app'),
            //         ts.createIdentifier('interface')
            //     ),
            //     undefined, // type arguments, e.g. Foo<T>()
            //     [
            //         ts.createNumericLiteral(String(interfaceMask)),
            //         ts.createThis()
            //     ]
            // );
            classNode.members.push(
                ts.createProperty(
                    [],
                    [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                    ts.createIdentifier('$intf'),
                    ts.createToken(ts.SyntaxKind.ExclamationToken),
                    ts.createKeywordTypeNode(ts.SyntaxKind.ArrayLiteralExpression),
                    ts.createArrayLiteral(
                        interfaceMask.map(id => ts.createNumericLiteral(String(id)))
                    )
                )
            );

            // let constructorNode = getOrCreateConstructor(classNode);
            // let superNode = getSuperNode(constructorNode);
            // if(superNode != null){
            //     let superNodeIndex = constructorNode.body.statements.indexOf(superNode);
            //     constructorNode.body.statements.splice(superNodeIndex + 1, 0, initInterfacesCall); // after super
            // }else
            //     constructorNode.body.statements.unshift(initInterfacesCall);
        }
    }

    function initAppEvents(classNode){
        let jsonFields = [];
        let jsonMethods = [];
        let jsonMergeFields = [];
        let jsonFieldNameToAlias = [];
        let jsonAliasToMethodName = [];
        let noStaticFieldsCount = 0;
        if(classNode.members){
            let className = classNode.name.escapedText;
            for(let member of classNode.members){
                if(member.kind == ts.SyntaxKind.PropertyDeclaration){
                    if(!member.modifiers || member.modifiers.find(m => m.kind == ts.SyntaxKind.StaticKeyword) == null){
                        noStaticFieldsCount++;
                        let memberName = member.name.escapedText;
                        if(isNodeHasDecorator(member, ANNOTATION_TO_JSON)){
                            let aliasName = getDecoratorArgumentMethodName(member, ANNOTATION_TO_JSON);
                            if(aliasName){
                                jsonFieldNameToAlias.push(
                                    ts.createPropertyAssignment(memberName, ts.createStringLiteral(aliasName))
                                );
                            }else{
                                jsonFields.push(ts.createStringLiteral(memberName));
                            }
                        }else if(isNodeHasDecorator(member, ANNOTATION_JSON_MERGE)){
                            jsonMergeFields.push(ts.createStringLiteral(memberName))
                        }
                    }
                    removeDecorator(member, ANNOTATION_TO_JSON);
                    removeDecorator(member, ANNOTATION_JSON_MERGE);
                }
                if(member.kind == ts.SyntaxKind.MethodDeclaration){
                    if(member.modifiers && member.modifiers.find(m => m.kind == ts.SyntaxKind.StaticKeyword) == null){
                        if(isNodeHasDecorator(member, ANNOTATION_TO_JSON)){
                            let methodName = member.name.escapedText;
                            let aliasName = getDecoratorArgumentMethodName(member, ANNOTATION_TO_JSON);
                            if(aliasName){
                                jsonAliasToMethodName.push(
                                    ts.createPropertyAssignment(aliasName, ts.createStringLiteral(methodName))
                                );
                            }else{
                                jsonMethods.push(ts.createStringLiteral(methodName));
                            }
                        }
                    }
                    removeDecorator(member, ANNOTATION_TO_JSON);
                }
                if(member.kind == ts.SyntaxKind.PropertyDeclaration && isNodeHasDecorator(member, ANNOTATION_INIT_EVENT)){
                    let classFile = classNode.getSourceFile().fileName;
                    let neededModifiers = (member.modifiers || []).filter(m => (m.kind == ts.SyntaxKind.ReadonlyKeyword) || (m.kind == ts.SyntaxKind.StaticKeyword));
                    let memberName = member.name.escapedText;
                    if(neededModifiers.length == 2){
                        let isCompositeEvent = member.type.members != null;
                        let events = member.type.members || [member];
                        let properies = [];
                        for(let event of events){
                            let eventName = memberName + (isCompositeEvent? ('.'+ event.name.escapedText): '');
                            if(event.type.typeName && event.type.typeName.escapedText == APP_EVENT_TYPE){
                                let eventId;
                                for(let i = 0; i < eventToIdentifier.length; i++){
                                    let event = eventToIdentifier[i];
                                    if(event.classFile == classFile && event.className == className && event.memberName == eventName){
                                        event.init = true;
                                        eventId = i;
                                        break;
                                    }
                                }
                                if(eventId == null)
                                    eventId = eventToIdentifier.push({
                                        classFile: classNode.getSourceFile().fileName,
                                        className: className,
                                        memberName: eventName,
                                        init: true
                                    }) - 1;

                                if(isCompositeEvent)
                                    properies.push(ts.createPropertyAssignment(event.name.escapedText, ts.createStringLiteral(String(eventId))));
                                else
                                    member.initializer = ts.createStringLiteral(String(eventId));
                            }else
                                throw new Error(`Event "${className}.${eventName}" must have ${APP_EVENT_TYPE} type`)
                        }

                        if(isCompositeEvent)
                            member.initializer = ts.createObjectLiteral(properies);
                    }else
                        throw new Error(`Event "${className}.${memberName}" must be a static & readonly`)
                    removeDecorator(member, ANNOTATION_INIT_EVENT);
                }
            }
        }
        if(jsonFieldNameToAlias.length > 0 || jsonFields.length > 0 || jsonAliasToMethodName.length > 0 || jsonMethods.length > 0 || jsonMergeFields.length > 0){
            classNode.members.push(
                ts.createProperty(
                    [],
                    [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                    ts.createIdentifier('$json'),
                    undefined,
                    undefined,
                    ts.createObjectLiteral([
                        ts.createPropertyAssignment('f', ts.createArrayLiteral(jsonFields)), //fields
                        ts.createPropertyAssignment('fa', ts.createObjectLiteral(jsonFieldNameToAlias)), //aliasName to fieldName
                        ts.createPropertyAssignment('m', ts.createArrayLiteral(jsonMethods)), //methodNames
                        ts.createPropertyAssignment('am', ts.createObjectLiteral(jsonAliasToMethodName)), //aliasName to fieldName
                        ts.createPropertyAssignment('mf', ts.createArrayLiteral(jsonMergeFields)), //merge fields
                    ])
                )
            );
        }
    }

    function initEnums(node){
        if(node.kind != ts.SyntaxKind.ClassDeclaration || !isNodeHasDecorator(node, ANNOTATION_ENUM))
            return;
            
        let className = node.name.escapedText;
        let parent = ts.getClassExtendsHeritageElement(node);
        let enumerableIdentifier = getRealIdentifier(node.getSourceFile(), ENUMERABLE_IDENTIFIER);
        if(parent == null || parent.expression.escapedText != enumerableIdentifier)
            throw new Error(`Enum ${className} doesn't not extend Enumerable!`)
        
        node.members.push(
            ts.createProperty(
                [],
                [ts.createModifier(ts.SyntaxKind.StaticKeyword)],
                ts.createIdentifier('$'),
                undefined,
                undefined,
                ts.createCall(
                    ts.createPropertyAccess(
                        ts.createIdentifier(className),
                        ts.createIdentifier('init')
                    ),
                    undefined, // type arguments, e.g. Foo<T>()
                    [
                        ts.createIdentifier(className),
                    ]
                )
            )
        );

        removeDecorator(node, ANNOTATION_ENUM);
    }

    function getRealIdentifier(sourceFile, relativeClassPath) {
        if(!sourceFile.resolvedModules.has(relativeClassPath))
            return null
        for(let statement of sourceFile.statements){
            if(statement.kind == ts.SyntaxKind.ImportDeclaration){
                if(statement.moduleSpecifier.text == relativeClassPath){
                    return statement.importClause.name.escapedText;
                }
            }
        }
    }


    let files = [];
    let isInitialized;

    var transformer = function (context) {
        var visitor = function (node) {
            if (node.kind === ts.SyntaxKind.ClassDeclaration) {
                // let className = node.name.escapedText;
                // if(className == APP_CLASS_NAME)
                //     appClassNode = node;
                // else 
                if(getParentClassName(node) == 'Array'){
                    let constructorNode = getOrCreateConstructor(node);
                    let superNode = getSuperNode(constructorNode);
                    if(superNode != null){
                        if(superNode.expression.arguments && superNode.expression.arguments.length > 0){
                            throw new Error('Super node should be without arguments when you extending array');
                        }
                        let superNodeIndex = constructorNode.body.statements.indexOf(superNode);
                        constructorNode.body.statements.splice(superNodeIndex, 1);
                    }
                }
                // if(isEntryPointNode(node)){
                //     // entryPointClassNodes.push(node);
                //     configureEntryPointClass(node, context)
                // }
                if(isComponentNode(node)){
                    // components[className] = node;
                    configureComponent(node, context);
                }

                initAppEvents(node);

                initInterfacesDef(node, context);

                tryBindListeners(node);

                injectAutowired(node);

                initEnums(node);





                // tryBindListeners(node);
                // if(isNodeHasDecorator(node, ANNOTATION_BEAN) && isHasEmptyPublicConscructor(node))
                // beans.push(className);
            }else if(node.kind == ts.SyntaxKind.CallExpression
                 && node.expression.escapedText == TYPE_CLASS_NAME 
                 && (node.arguments == null || node.arguments.length == 0)){
                     
                let typeName = node.typeArguments[0].typeName.escapedText;
                let nodePath = getNodePath(node, typeName);
                node.arguments = [nodePath?
                    ts.createNumericLiteral(String(Interfaces.getId(nodePath)))
                    :
                    ts.createIdentifier(typeName)
                ];
            // }
            // else if(node.kind == ts.SyntaxKind.SourceFile){
            //     var result = ts.visitEachChild(node, visitor, context);
            //     injectAutowiredEverywhere(node, context);
            //     return result;
            }else {
                if(node.kind == ts.SyntaxKind.ImportDeclaration && node.importClause.name){
                    let name = node.importClause.name.escapedText;
                    if(
                        name == ANNOTATION_AUTOWIRED ||
                        name == ANNOTATION_BEAN ||
                        name == ANNOTATION_BEANS ||
                        name == ANNOTATION_ENTRY_POINT_CLASS ||
                        name == ANNOTATION_ONCHANGE ||
                        name == ANNOTATION_LISTENER ||
                        name == ANNOTATION_BEFOREDETACH ||
                        name == ANNOTATION_AFTERATTACH ||
                        name == ANNOTATION_ELEMENT ||
                        name == ANNOTATION_INIT_EVENT ||
                        name == ANNOTATION_INIT_VIRTUAL_COMPONENT ||
                        // name == ANNOTATION_TEMPLATE ||
                        name == ANNOTATION_TO_JSON ||
                        name == ANNOTATION_JSON_MERGE ||
                        name == ANNOTATION_REACTIVE_CLASS ||
                        name == ANNOTATION_REQUEST_MAPPING ||
                        name == ANNOTATION_ENUM){
                        node.kind = -1;
                        return;
                    }
                }
            }
            return ts.visitEachChild(node, visitor, context);
        };

        return function (node) {
            try{
                if(!isInitialized){
                    isInitialized = true;
                    let host = context.getEmitHost();
                    let basePath = host.getCommonSourceDirectory();
                    let libPath = basePath + 'node_modules/';
                    let workNodes = host.getSourceFiles().filter(f => 
                        !f.hasNoDefaultLib
                        &&
                        !host.isSourceFileFromExternalLibrary(f)
                        &&
                        !f.fileName.startsWith(libPath +'typescript/')
                        &&
                        !f.fileName.startsWith(libPath +'plastique/')
                    );
                    let vis = function (node) {
                        componentExpr: if(node.kind == ts.SyntaxKind.SourceFile){
                            let interfaceDeclaration = 
                                node.statements.find(s => s.kind === ts.SyntaxKind.InterfaceDeclaration && isImplementsInterface(context, s, 'Component'));
                            if(interfaceDeclaration == null)
                                break componentExpr;
                            let className = interfaceDeclaration.name.escapedText;
                            let classIndex = node.statements.findIndex(s => s.kind === ts.SyntaxKind.ClassDeclaration && s.name.escapedText == className);
                            if(classIndex < 0){
                                //its just interface, not component
                                break componentExpr;
                                
                            }
                            //append after class declaration
                            node.statements.splice(classIndex + 1, 0, ts.createCall(
                                ts.createPropertyAccess(
                                    ts.createIdentifier('_app'),
                                    ts.createIdentifier('mixin')
                                ),
                                undefined, // type arguments, e.g. Foo<T>()
                                [
                                    ts.createIdentifier(className),
                                ]
                            ));
                        }
                        if(node.kind == ts.SyntaxKind.ClassDeclaration){
                            if(isComponentNode(node)){
                                let className = node.name.escapedText;
                                for(let member of node.members){
                                    if(member.kind == ts.SyntaxKind.PropertyDeclaration){
                                        if(isNodeHasDecorator(member, ANNOTATION_INIT_VIRTUAL_COMPONENT)){
                                            removeDecorator(node, ANNOTATION_INIT_VIRTUAL_COMPONENT);
                                            let neededModifiers = (member.modifiers || []).filter(m => (m.kind == ts.SyntaxKind.ReadonlyKeyword) || (m.kind == ts.SyntaxKind.StaticKeyword));
                                            let memberName = member.name.escapedText;
                                            if(neededModifiers.length == 2){
                                                MemberInitializator.initialize(node, member, VIRTUAL_COMPONENT_CLASS_NAME, VirtualComponents)
                                            }else
                                                throw new Error(`Event "${className}.${memberName}" should be be a static & readonly`)
                                        }
                                    }
                                }
                            }
                        }
                        typeExpr: if(node.kind == ts.SyntaxKind.CallExpression && node.expression.escapedText == TYPE_CLASS_NAME){
                            if(node.arguments != null && node.arguments.length == 1){
                                if(node.typeArguments != null && node.typeArguments.length > 0)
                                    throw new Error('Type should be with generic type or argument type but not both!')
                                break typeExpr;
                            }
                            if(node.typeArguments == null || node.typeArguments.length == 0)
                                throw new Error('Genertic type of Type is not set!')
                            if(node.typeArguments[0].typeName == null)
                                throw new Error('Genertic type of Type is not valid: '+ node.typeArguments)

                            let typeName = node.typeArguments[0].typeName.escapedText;
                            let typePath = getNodePath(node, typeName);
                            if(typePath){
                                let classOrInterface = getClassByPath(typePath, typeName, context);
                                if(classOrInterface){
                                    if(classOrInterface.kind == ts.SyntaxKind.ClassDeclaration) {
                                        throw new Error(`Generic type ${typeName} is not interface!`);
                                    }else{
                                        Interfaces.add(typePath);
                                        // getInterfacesDeep(classOrInterface, context).concat(typePath).forEach(path => Interfaces.add(path))
                                    }
                                }else
                                    throw new Error(`Type ${typeName} is not recognized!`);
                            }
                        }
                        return ts.visitEachChild(node, vis, context);
                    }
                    workFilesPaths = workNodes.map(n => n.fileName);
                    for(let node of workNodes){
                        if(node.resolvedModules){
                            let importModules = Array.from(node.resolvedModules.values())
                                .filter(m => m != void 0); //remove remove modules
                            let hasTypeUsage = importModules.find(m => m.isExternalLibraryImport && m.originalFileName.endsWith(TYPE_CLASS_PATH));
                            let hasComponentUsage = importModules.find(m => m.isExternalLibraryImport && m.originalFileName.endsWith(COMPONENT_INTERFACE_PATH));
                            let hasVirtualComponentUsage = importModules.find(m => m.isExternalLibraryImport && m.originalFileName.endsWith(VIRTUAL_COMPONENT_ANNOTATION_PATH));
                            let hasEntryPoint = importModules.find(m => m.isExternalLibraryImport && m.originalFileName.endsWith(ENTRYPOINT_ANNOTATION_PATH));
                            if(hasEntryPoint){
                                let entryPoint = node.statements.find(s => s.kind == ts.SyntaxKind.ClassDeclaration && isEntryPointNode(s));
                                if(entryPoint){
                                    if(entryPointClassPath)
                                        console.error('EntryPoint is already defined: '+ entryPointClassPath)
                                    entryPointClassPath = node.fileName;
                                    configureEntryPointClass(entryPoint, context)
                                }
                            }

                            if(hasTypeUsage || hasComponentUsage || hasVirtualComponentUsage){
                                ts.visitNode(node, vis);
                            }
                        }
                    }
                }
                if(!files.includes(node.fileName)) {
                    let result = ts.visitNode(node, visitor);
                    files.push(node.fileName)
                    return result
                }
                // let notInitEvent = eventToIdentifier.find(e => e.init == false);
                // if(notInitEvent)
                //     throw new Error('Event "'+ (notInitEvent.className +"."+ notInitEvent.memberName) +" is not found!")

                return node;
            }catch(e){
                console.error(e);
                process.exit(1)
            }
        };
    };
    return transformer;
}

class CompilePlugin{
    apply(compiler){
        const isDevelopmentMode = compiler.options.mode && compiler.options.mode == 'development';
        // if(isDevelopmentMode)
            // compiler.options.devtool = "inline-source-map"
        compiler.options.devtool = false

        const ast = require('abstract-syntax-tree');
        function replaceDefaultInstanceof(element) {
            ast.replace(element, {
                enter (node) {
                    if (node.operator && node.operator == 'instanceof') {
                        let newNode = ast.parse('_app.instanceOf(1, 2)').body[0].expression;
                        newNode.arguments[0] = node.left;
                        newNode.arguments[1] = node.right;
                        return newNode;
                    }
                    return node
                }
            })
        }
        function moveAppImportDefToTop(element, appModuleIndex){
            let statements = element.body.body[1].expression.callee.object.body.body;
            let appImportDefIndex = statements.findIndex(statement => {
                if(
                    statement.type == 'VariableDeclaration' 
                    && statement.declarations 
                    && statement.declarations[0].init.callee.name == "__webpack_require__"
                ){
                    let val = statement.declarations[0].init.arguments[0].value;
                    return val == appModuleIndex || (typeof val == 'string' && val.endsWith('/plastique/base/App.ts'))
                }
                return false;
            })
            if(appImportDefIndex < 0)
                console.error('AppImport definition is not found!');
            statements.splice(1, 0, statements.splice(appImportDefIndex, 1)[0]); // move to 1 position
        }

        // if(isDevelopmentMode) {
        //     compiler.hooks.compilation.tap('plastique modules compiling', function (compilation) {
        //         compilation.hooks.succeedModule.tap('plastique module compiling', function (module) {
        //             if (!workFilesPaths.includes(module.resource))
        //                 return;
        //             let tree = ast.parse(module._source._value);
        //             replaceDefaultInstanceof(tree)
        //             module._source._value = ast.generate(tree)
        //         });
        //     });
        // }
        // compiler.hooks.afterCompile.tap('plastique after compiling operations', function (compilation) {
        //     compilation.compiler.parentCompilation = true; // to ignore ts-loader afterCompile hook, because its diagnostic fails
        // });

        // debugger;
        // compiler.hooks.compilation.tap('plastique final compilation of modules', function(compilation){
        //     compilation.hooks.optimizeChunkAssets.tap('plastique final compilation of modules', function(chunks){
        //         const uglifyJS = require("uglify-js");
        //         const { ConcatSource, RawSource } = require("webpack-sources");
        //         const AppModuleIndex = compilation.modules.findIndex(m => m.resource.endsWith('/plastique/base/App.ts'));
        //         if(AppModuleIndex < 0)
        //             console.error('App.ts is not found!');

        //         chunks.forEach(chunk => {
        //             chunk.files.forEach(asset => {
        //                 let source = compilation.assets[asset].source();
        //                 let tree = ast.parse(source);

        //                 let modulesWrapper = tree.body[0].expression.arguments[0];
        //                 let modules = isDevelopmentMode? modulesWrapper.properties: modulesWrapper.elements;
                            
        //                 modules.forEach((element, index) => {
        //                     let modulePath = compilation.modules[index].resource;
        //                     if(workFilesPaths.includes(modulePath)) {
        //                         element = isDevelopmentMode ? element.value : element;
        //                         replaceDefaultInstanceof(element)
        //                         if(entryPointClassPath == modulePath)
        //                             moveAppImportDefToTop(element, AppModuleIndex)
        
        //                         let template = componentPathToTemplate[modulePath];
        //                         if (template == null)
        //                             return;
        
        //                         let origBody = element.body;
        //                         let fakeWrap = ast.parse('(function(){1}());');
        //                         fakeWrap.body[0].expression.callee.body = origBody;
        //                         fakeWrap.body.unshift(ast.parse(`$["__vueTemplateGenerator${modulePath}__"]`).body[0]);
        //                         element.body = {body: fakeWrap.body, type: "BlockStatement"}
        //                     }
        //                 });
        //                 let newCode = isDevelopmentMode? ast.generate(tree): uglifyJS.minify(ast.generate(tree)).code;
        //                 for(let componentPath in componentPathToTemplate){
        //                     let vueTemplateGeneratorFunc = `function ${VUE_TEMPLATE_FUNC_NAME}(){return ${componentPathToTemplate[componentPath]}}`;
        //                     if(isDevelopmentMode)
        //                         newCode = newCode.replace(`$["__vueTemplateGenerator${componentPath}__"]`, vueTemplateGeneratorFunc);
        //                     else
        //                         newCode = newCode.replace(`$["__vueTemplateGenerator${componentPath}__"],`, vueTemplateGeneratorFunc +'!');
        
        //                 }
        //                 compilation.assets[asset] = new ConcatSource(
        //                     new RawSource(newCode),
        //                     compilation.assets[asset]
        //                 );
        //             });
        //         });
        //     })
        // });
        
        compiler.hooks.emit.tap('plastique final compilation of modules', function(compilation){
            const uglifyJS = require("uglify-js");
            const AppModuleIndex = compilation.modules.findIndex(m => m.resource.endsWith('/plastique/base/App.ts'));
            if(AppModuleIndex < 0)
                console.error('App.ts is not found!');
            for(let asset in compilation.assets){
                let source = compilation.assets[asset].source();
                let tree = new ast(source);

                let modulesWrapper = tree.body[0].expression.arguments[0];
                let modules = isDevelopmentMode? modulesWrapper.properties: modulesWrapper.elements;
                    
                modules.forEach((element, index) => {
                    let modulePath = compilation.modules[index].resource;
                    if(workFilesPaths.includes(modulePath)) {
                        element = isDevelopmentMode ? element.value : element;
                        replaceDefaultInstanceof(element)
                        if(entryPointClassPath == modulePath)
                            moveAppImportDefToTop(element, AppModuleIndex)
                            if(isDevelopmentMode){
                                let evalExpr = ast.parse('eval("")').body[0];
                                evalExpr.expression.arguments[0].value = ast.generate(element.body.body[1]) + `\n//# sourceURL=webpack:///${modulePath}?`; //.replace(/\\/g, '\\\\');
                                element.body.body[1] = evalExpr;
                            }
                        let template = componentPathToTemplate[modulePath];
                        if (template == null)
                            return;

                        let origBody = element.body;
                        let fakeWrap = ast.parse('(function(){1}());');
                        fakeWrap.body[0].expression.callee.body = origBody;
                        fakeWrap.body.unshift(ast.parse(`$["__vueTemplateGenerator${modulePath}__"]`).body[0]);
                        element.body = {body: fakeWrap.body, type: "BlockStatement"}
                    }
                });
                let newCode = isDevelopmentMode? ast.generate(tree): uglifyJS.minify(ast.generate(tree, {comments: true})).code;
                for(let componentPath in componentPathToTemplate){
                    let vueTemplateGeneratorFunc = `function ${VUE_TEMPLATE_FUNC_NAME}(){return ${componentPathToTemplate[componentPath]}}`;
                    if(isDevelopmentMode)
                        newCode = newCode.replace(`$["__vueTemplateGenerator${componentPath}__"]`, vueTemplateGeneratorFunc);
                    else
                        newCode = newCode.replace(`$["__vueTemplateGenerator${componentPath}__"],`, vueTemplateGeneratorFunc +'!');

                }
                // if(isDevelopmentMode)
                //     compilation.assets[asset].children[0]._value = newCode
                // else
                    compilation.assets[asset]._cachedSource = newCode;
            }
        });
    }
}
function Loader(content) {
    // if(this.resourcePath.endsWith('node_modules/plastique/Type.ts'))
    //     return content;
    // content = content.replace(/Type\s*<\s*(\w+)>\s*\(\s*\)/g, function(typeDef, interfaceName){
    //     return typeDef.replace(/\(\s*\)/, '('+ Interfaces.getId(interfaceName) +')')
    // })
    return content;
}
Loader.Plastique = Plastique,
Loader.CompilePlugin = CompilePlugin,
Loader.LibraryPlugin = function(varToLibPath){
    const path = require("path");
    const webpack = require("webpack");
    varToLibPath = varToLibPath || {};
    for(let lib in varToLibPath){
        if(varToLibPath[lib] == null || varToLibPath[lib] == '')
            varToLibPath[lib] = path.join(__dirname, './compileUtils', 'empty.ts')
    }
    return new webpack.ProvidePlugin(Object.assign(varToLibPath ,{
        '__extends': path.join(__dirname, './compileUtils', 'extends.ts'),
        '__decorate': path.join(__dirname, './compileUtils', 'decorate.ts'),
        '__assign': path.join(__dirname, './compileUtils', 'assign.ts')
    }))
}
module.exports = Loader;